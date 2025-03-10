import { parseArgs } from "jsr:@std/cli/parse-args";
import { dirname, join, resolve, basename, extname } from "https://deno.land/std@0.119.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.119.0/fs/mod.ts";
import * as path from "https://deno.land/std@0.119.0/path/mod.ts";

const pathLib = path; // Auto-selects the correct module

interface Args {
  _: string[];
  help?: boolean;
  h?: boolean;
  directory?: string;
  d?: string;
  keep?: boolean;
  k?: boolean;
  images?: boolean;
  i?: boolean;
  geometry?: string;
  g?: string;
  tileconfig?: string;
  c?: string;
  l?: number;
  length?: number;
  outputPath?: string;
  o?: string;
}

// Call main with command line arguments
if (import.meta.main) {
  main(Deno.args);
}

function printHelp(): void {
  console.log(`
    Makes a image collage for all video files OR image files in targeted folder and all subfolders. Saves them in a /collage folder as .jpg file.

    Video format support: .mp4, .mkv, .avi, .mov, .flv, .wmv
    Image format support: .jpg, .jpeg, .png
    Usage: deno run --allow-read --allow-write --allow-run=ffmpeg,ffprobe,magick main.ts [options]

    Options:
      -h,  --help                Show this help message
      -d,  --directory <path>    Directory to scan for video files
      -k,  --keep                Keep screenshots after creating collage (default: false)
      -i,  --images              Directory to scan images for image collage (default: false)
      -c,  --tiles               Tile config (default: 3x2)
      -l,  --length              Minimum video length in minutes (default: 3)
      -o,  --outputPath          Output path for image collages (default: "./collage" contextually to the input file)
    Example:
      Create a collage for video files in a directory:
      deno run --allow-read --allow-write --allow-run=ffmpeg,ffprobe,magick main.ts -d "/path/to/videos"

      Creates a collage in "./pictures" for video files over 5 minutes long while removing the screenshots after collage creation:
      deno run --allow-read --allow-write --allow-run=ffmpeg,ffprobe,magick main.ts -d "/path/to/videos" -l 5 -o ."/pictures"
      
      Create a collage for image files while keeping the screenshots after collage creation in a 5x2 layout:

      deno run --allow-read --allow-write --allow-run=ffmpeg,ffprobe,magick main.ts -d "/path/to/videos" -i -k -c "5x2"
    Note:
      - Requires ffmpeg, ffprobe, and ImageMagick to be installed and available in the PATH
      - For video files over 60 minutes the last 10 minutes are skipped to hopefully avoid spoilers
      - Any .jpg image with "-collage" in the end will be ignored
  `);
}

function parseArguments(args: string[]): Args {
  return parseArgs(args, {
    boolean: ["help", "keep"],
    string: ["directory"],
    alias: {
      "help": "h",
      "directory": "d",
      "keep": "k",
      "images": "i",
      "tileconfig": "c",
      "length": "l",
      "outputPath": "o"
    },
    default: { 
       keep: false,
       images: false,
       length: 3,
       tileconfig: "3x2" // Default tile configuration 
    }
  }) as Args;
}

//Console commands
async function main(inputArgs: string[]): Promise<void> {
  const args = parseArguments(inputArgs);

  // If help flag enabled, print help.
  if (args.help) {
    printHelp();
    Deno.exit(0);
  }

  // Check if directory is provided
  if (!args.directory) {
    console.error("Error: Directory path is required");
    printHelp();
    Deno.exit(1);
  }

  // Validate directory path
  try {
    const fixedPath = await Deno.realPath(args.directory);
    const pathInfo = await Deno.stat(fixedPath);
    if (!pathInfo.isDirectory) {
      console.error("Error: Input path must be a directory");
      Deno.exit(1);
    }
    const tileCount = args.tileconfig || "3x2"; // Provide a default value if undefined
    const outputPath = args.outputPath || "";
    if(args.images) {
      await createImageCollagesFromImages(fixedPath, tileCount, outputPath)
      Deno.exit(1);
    }
    // Call createImageCollage with the directory path
    const videoLength = args.length || 3;
    await createImageCollage(fixedPath, args.keep, videoLength, tileCount, outputPath)
    .catch((error) => {
      console.error("Error creating image collage:");
      console.error(error);
      Deno.exit(1);
    });
  } catch (error) {
    console.error("Error: Invalid directory path");
    console.error(error);
    Deno.exit(1);
  }
}

async function createImageCollagesFromImages(inputPath: string, tileConfig: string, outputPath: string): Promise<void> {
  const directories = await readDirectory(inputPath);
  const supportedExtensions = [".jpg", ".jpeg", ".png"];

  // Filter valid image files
  const imageFiles = directories.filter(file => 
    supportedExtensions.includes(extname(file).toLowerCase()) && 
    !basename(file).toLowerCase().includes("-collage.jpg")
  );

  if (imageFiles.length === 0) {
    console.error("No image files found in the directory.");
    return;
  }


  // Parse tile configuration
  const [cols, rows] = tileConfig.split('x').map(Number);
  const imagesPerCollage = cols * rows;

  console.log(`Found ${imageFiles.length} images`);
  console.log(`Creating collages with ${imagesPerCollage} images each (${tileConfig} layout)`);

  // Split images into groups based on tile count
  const imageGroups = chunkArray(imageFiles, imagesPerCollage);
  
  // Process each group
  for (let i = 0; i < imageGroups.length; i++) {
    const group = imageGroups[i];
    const count = group.length;

    if (count < imagesPerCollage) {
      console.log(`Last group only has ${count} images. Changing tile config to ${cols}x${Math.ceil(count / cols)}`);
      tileConfig = `${cols}x${Math.ceil(count / cols)}`;
    }

    if(outputPath == "") {
      outputPath = await ensureCollageDirectory(imageGroups[i][0]);
    }
    try {
      await ensureDir(outputPath);
    } catch (error) {
      console.error("Error: Invalid output path");
      console.error(error);
      return;
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = join(outputPath, `${timestamp}-collage.jpg`);
    
    console.log(`\nCreating collage ${i + 1} with ${count} images using ${tileConfig} layout`);
    group.forEach(f => console.log(`  ${basename(f)}`));
    
    await createMontage(outputFile, group, tileConfig);
  }
}

async function createImageCollage(inputPath: string, keep: boolean = false, minLength: number, tileConfig: string, outputPath: string): Promise<void> {
  console.log("Reading directory...");
  const directories: string[] = await readDirectory(inputPath);
  const supportedExtensions = [".mp4", ".mkv", ".avi", ".mov", ".flv", ".wmv"];
  const createdCollages: string[] = [];

  if (directories.length === 0) {
    console.error("No files found in the directory.");
    return;
  }

  // Process each video sequentially
  const mediaFiles = directories.filter(file => supportedExtensions.includes(extname(file).toLowerCase()));

  if (mediaFiles.length === 0) {
    console.error("No video files found in the directory.");
    return;
  }

  for (const file of mediaFiles) {
    console.log(`Processing ${file}...`);
    await captureScreenshotsFromFile(file, minLength, tileConfig);
  }

  console.log("Fetching all screenshots...");
  const screenshots: string[] = await readDirectory(inputPath);
  const imageFiles = screenshots.filter(file => 
    extname(file).toLowerCase() === ".jpg" && !file.includes("-collage.jpg")
  );

  // Group screenshots by movie
  const movieGroups = groupScreenshotsByMovie(imageFiles);

  // Process each movie's screenshots separately
  for (const [movieName, movieScreenshots] of Object.entries(movieGroups)) {
    // Sort screenshots by timestamp to ensure correct order
    movieScreenshots.sort((a, b) => {
      const seqA = parseInt(a.match(/screenshot-(\d+)/)?.[1] || "0");
      const seqB = parseInt(b.match(/screenshot-(\d+)/)?.[1] || "0");
      return seqA - seqB;
    });

    // Calculate optimal tile configuration based on number of screenshots
    let actualTileConfig: string;
    const count = movieScreenshots.length;
    
    if (count <= 4) {
      actualTileConfig = "2x2";
    } else if (count <= 6) {
      actualTileConfig = "3x2";
    } else if (count <= 9) {
      actualTileConfig = "3x3";
    } else if (count <= 12) {
      actualTileConfig = "4x3";
    } else if (count <= 15) {
      actualTileConfig = "5x3";
    } else {
      actualTileConfig = tileConfig;
    }
    if(outputPath == "") {
      outputPath = await ensureCollageDirectory(movieScreenshots[0]);
    }
    try {
      await ensureDir(outputPath);
    } catch (error) {
      console.error("Error: Invalid output path");
      console.error(error);
      return;
    }

    const outputFile = join(outputPath, `${movieName}-collage.jpg`);
    console.log(`Creating collage for ${movieName} with ${count} screenshots using ${actualTileConfig} layout`);
    await createMontage(outputFile, movieScreenshots, actualTileConfig);
    createdCollages.push(outputFile);
  }

  if (!keep) {
    await removeScreenshots(imageFiles);
  } else {
    console.log("Keeping screenshots!");
  }
  console.log("All tasks completed!");
}

async function readDirectory(path: string): Promise<string[]> {
  const entries: string[] = [];

  async function traverseDirectory(currentPath: string) {
    for await (const entry of Deno.readDir(currentPath)) {
      const fullPath = join(currentPath, entry.name);
      entries.push(fullPath);
      if (entry.isDirectory) {
        await traverseDirectory(fullPath);
      }
    }
  }

  await traverseDirectory(path);
  return entries;
}

async function getVideoDuration(videoFile: string): Promise<number> {
  const command = new Deno.Command("ffprobe", {
    args: [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      videoFile
    ],
    stdout: "piped",
    stderr: "piped"
  });

  const { stdout } = await command.output();
  const durationStr = new TextDecoder().decode(stdout).trim();
  const duration = parseFloat(durationStr);

  return isNaN(duration) ? 0 : duration;
}

async function captureScreenshotsFromFile(videoFile: string, minimumLength: number, tileConfig: string = "3x2") {
  const [cols, rows] = tileConfig.split('x').map(Number);
  const screenshotMaxAmount = cols * rows;
  const duration = await getVideoDuration(videoFile);
  const durationMinutes = Math.floor(duration / 60);
  
  console.log(`Video: ${basename(videoFile)}`);
  console.log(`Duration: ${durationMinutes} minutes (${Math.floor(duration)} seconds)`);
  console.log(`Target screenshots: ${screenshotMaxAmount} (${cols}x${rows})`);
  
  if (duration == null) {
    console.log(`Skipping ${videoFile}, couldn't get duration.`);
    return;
  }

  if (duration < minimumLength * 60) {
    console.log(`Skipping ${videoFile}, duration is less than ${minimumLength} minutes.`);
    return;
  }

  // For very short videos (less than 5 minutes), use the entire duration
  if (duration <= 300) {
    console.log(`Short video detected, using entire duration`);
    // Leave 5 seconds at start and end
    const usableDuration = duration - 10;
    const interval = usableDuration / (screenshotMaxAmount + 1);
    await captureScreenshots(videoFile, interval, screenshotMaxAmount, 5);
    return;
  }

  // For longer videos, use the previous logic
  if (duration < 60 * 60) {
    const interval = duration / (screenshotMaxAmount + 1);
    await captureScreenshots(videoFile, interval, screenshotMaxAmount, 30); // Start 30s in
    return;
  }

  // For very long videos, use the original logic
  const startTime = 120;
  const endTime = Math.max(duration - 600, startTime);
  const usableDuration = endTime - startTime;
  const interval = usableDuration / (screenshotMaxAmount + 1);

  await captureScreenshots(videoFile, interval, screenshotMaxAmount, startTime);
}

async function captureScreenshots(videoFile: string, interval: number, screenshotMaxAmount: number, startTime: number) {
  const maxRetries = 3;
  const createdFiles: string[] = [];
  for (let i = 1; i <= screenshotMaxAmount; i++) {
    const timestamp = startTime + (interval * i);
    const hours = Math.floor(timestamp / 3600);
    const minutes = Math.floor((timestamp % 3600) / 60);
    const seconds = Math.floor(timestamp % 60);
    const time = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    console.log(`Taking screenshot at ${time}`);
    const dirName = dirname(videoFile);
    const fileNameWithoutExt = basename(videoFile, extname(videoFile));
    // Changed filename format to use sequential numbers instead of minutes
    const outputFile = join(dirName, `${fileNameWithoutExt}-screenshot-${i.toString().padStart(3, '0')}.jpg`);
    
    let attempt = 0;
    let success = false;
    while (attempt < maxRetries && !success) {
      attempt++;
      try {
        const command = new Deno.Command("ffmpeg", {
          args: [
            "-y",
            "-ss", time,
            "-i", videoFile,
            "-vframes", "1",
            "-q:v", "2", // Increased quality
            "-an", // No audio
            "-sn", // No subtitles
            "-update", "1", // Overwrite
            outputFile
          ],
          stdout: "piped",
          stderr: "piped"
        });

        const { code, stderr } = await command.output();
        const error = new TextDecoder().decode(stderr);
        
        if (code === 0) {
          // Verify file exists and has size > 0
          try {
            const fileInfo = await Deno.stat(outputFile);
            if (fileInfo.size > 0) {
              success = true;
              createdFiles.push(outputFile);
              console.log(`Successfully created screenshot ${i}/${screenshotMaxAmount}`);
            } else {
              console.error(`Screenshot file is empty: ${outputFile}`);
            }
          } catch (e) {
            if (e instanceof Error) {
              console.error(`Failed to verify screenshot file: ${e.message}`);
            } else {
              console.error(`Failed to verify screenshot file: ${e}`);
            }
          }
        } else {
          console.error(`FFmpeg error (attempt ${attempt}): ${error}`);
        }
      } catch (e) {
        if (e instanceof Error) {
        console.error(`System error (attempt ${attempt}): ${e.message}`);
        } else {
          console.error(`System error (attempt ${attempt}): ${e}`);
        }
      }
    }
    
    if (!success) {
      console.error(`Failed to create screenshot at ${time} after ${maxRetries} attempts`);
    }
  }

  console.log(`Captured ${createdFiles.length}/${screenshotMaxAmount} screenshots for ${basename(videoFile)}`);
  if (createdFiles.length !== screenshotMaxAmount) {
    console.error(`Warning: Some screenshots were not created successfully`);
  }
}


async function ensureCollageDirectory(inputPath: string): Promise<string> {
  const collageDir = join(dirname(inputPath), "collages");
  await ensureDir(collageDir);
  return collageDir;
}

async function createMontage(outputFile: string, inputFiles: string[], tileConfig: string = "3x2") {
  const outputDir = dirname(outputFile);
  await ensureDir(outputDir);

  console.log(`Creating montage with ${inputFiles.length} files`); // Debug line

  const command = new Deno.Command("magick", {
    args: [
      "montage",
      ...inputFiles,
      "-tile", tileConfig,
      "-geometry", "1920x1080+0+0", 
      "-background", "black",
      "-gravity", "center",
      outputFile
    ]
  });

  const { code } = await command.output();
  if (code === 0) {
    console.log("Montage created:", outputFile);
  } else {
    console.error("Montage creation failed.");
  }
}

async function removeScreenshots(screenshots: string[]) {
  console.log("Removing screenshots...");
  for (const screenshot of screenshots) {
    await Deno.remove(screenshot);
  }
}

function chunkArray(array: string[], chunkSize: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

function groupScreenshotsByMovie(files: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  
  for (const file of files) {
    const movieName = basename(file).split("-screenshot-")[0];
    if (!groups[movieName]) {
      groups[movieName] = [];
    }
    groups[movieName].push(file);
  }
  
  return groups;
}

