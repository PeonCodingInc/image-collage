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
    Makes a image collage for all video files OR image files in targeted folder and all subfolders. Saves them in targeted folder as .jpg file.
    
    Video format support: .mp4, .mkv, .avi, .mov, .flv, .wmv
    Image format support: .jpg, .jpeg, .png
    Usage: ./run_app.sh [options]

    Options:
      -h,  --help                Show this help message
      -d,  --directory <path>    Directory to scan for video files
      -k,  --keep                Keep screenshots after creating collage (default: false)
      -i,  --images              Directory to scan images for image collage (default: false)
      -c,  --tiles               Tile config (default: 3x2)
      -l,  --length              Minimum video length in seconds (default: 1200 (20 mins))
      -v,  --verbose             Enable verbose output
    Example:
      Create a collage for video files over 5 minutes long in "F:/videos/" and saves them in the folder that the command was executed in with 4x3 layout: 
      ./run_app.sh "F:/videos/" "./collages" -c "4x3" -l 300

      Creates a collage in "F:/pictures/" for pictures in "F:/pictures/collages" with 10x5 layout:
      ./run_app.sh "F:/pictures/" "F:/pictures/collages" -i -c "10x5"
    Note:
      - Requires ffmpeg, ffprobe, and ImageMagick to be installed and available in the PATH
      - For video files over 60 minutes the last 10 minutes are skipped to hopefully avoid spoilers
      - Any .jpg image with "-collage" in the end will be ignored
      - Video files under 40 seconds will be in a 2x2 layout
  `);
}

function parseArguments(args: string[]): Args {
  const parsed = parseArgs(args, {
    boolean: ["help", "keep", "images"],
    string: ["directory", "outputPath", "tileconfig"],
    alias: {
      help: "h",
      directory: "d",
      outputPath: "o",
      keep: "k",
      images: "i",
      tileconfig: "c",
      length: "l",
      verbose: "v"
    },
    default: {
      keep: false,
      images: false,
      length: 1200,
      tileconfig: "3x2"
    }
  });

  // Ensure `directory` and `outputPath` use the aliases properly
  return {
    ...parsed,
    directory: parsed.directory || parsed.d,   // Assign alias correctly
    outputPath: parsed.outputPath || parsed.o, // Assign alias correctly
    length: parsed.length !== undefined ? Number(parsed.length) : undefined, // Ensure `length` is a number
    l: parsed.l !== undefined ? Number(parsed.l) : undefined, // Ensure `l` is a number
    _: parsed._.filter((item): item is string => typeof item === 'string') // Ensure `_` contains only strings
  };
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
    !basename(file).toLowerCase().includes("-videocollage") &&    
    !basename(file).toLowerCase().includes("-imagecollage")
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
    const outputFile = join(outputPath, `${timestamp}-imagecollage.jpg`);
    
    console.log(`\nCreating collage ${i + 1} with ${count} images using ${tileConfig} layout`);
    
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
    extname(file).toLowerCase() === ".jpg" && 
    !file.includes("-imagecollage") &&
    file.includes("-screenshot-")
  );
  // Group screenshots by movie
  const movieGroups = groupScreenshotsByMovie(imageFiles);

  // Process each movie's screenshots separately
  for (const [movieName, movieScreenshots] of Object.entries(movieGroups)) {
    // Sort screenshots by timestamp to ensure correct order
    movieScreenshots.sort((a, b) => {
      const seqA = parseInt(a.match(/-screenshot-(\d+)/)?.[1] || "0");
      const seqB = parseInt(b.match(/-screenshot-(\d+)/)?.[1] || "0");
      return seqA - seqB;
    });
    console.log(`\nProcessing screenshots for ${movieName}...`);
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

    const outputFile = join(outputPath, `${movieName}-videocollage.jpg`);
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

async function captureScreenshotsFromFile(videoFile: string, minimumLength: number, tileConfig: string) {
  const [cols, rows] = tileConfig.split('x').map(Number);
  var screenshotMaxAmount = cols * rows;
  const duration = await getVideoDuration(videoFile);
  const durationMinutes = Math.floor(duration / 60);
  
  console.log(`Video: ${basename(videoFile)}`);
  console.log(`Duration: ${durationMinutes} minutes (${Math.floor(duration)} seconds)`);
  console.log(`Target screenshots: ${screenshotMaxAmount} (${cols}x${rows})`);
  
  if (duration == null) {
    console.log(`Skipping ${videoFile}, couldn't get duration.`);
    return;
  }

  if (duration < minimumLength) {
    console.log(`Skipping ${videoFile}, duration is less than ${minimumLength} seconds.`);
    return;
  }

  if(duration < 40) {
    screenshotMaxAmount = 4; // Limit to 15 screenshots
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
        const command = new Deno.Command("nice", {
          args: [
            "-n", "15", // Lower process priority (higher number = lower priority)
            "ffmpeg",
            "-threads", "2", // Limit CPU usage
            "-y", // Overwrite output
            "-ss", time, // Seek to timestamp
            "-i", videoFile, // Input file
            "-vframes", "1", // Only 1 frame
            "-q:v", "3", // Slightly lower quality for efficiency
            "-an", // No audio
            "-sn", // No subtitles
            "-update", "1", // Overwrite
            outputFile,
          ],
          stdout: "piped",
          stderr: "piped",
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
  const absPath = path.resolve(outputFile); // Ensure absolute path
  const outputDir = dirname(absPath);
  await ensureDir(outputDir);

  console.log(`Creating montage with ${inputFiles.length} files`); // Debug line
  // Adjust the geometry to reduce spacing and ensure appropriate image size
  const [cols, rows] = tileConfig.split('x').map(Number);
  const geometry = `${Math.floor(1920 / cols)}x${Math.floor(1080 / rows)}+0+0`; // Adjust this value as needed
  const command = new Deno.Command("nice", {
    args: [
      "-n", "15",
      "magick-montage",
      ...inputFiles,
      "-tile", tileConfig,
      "-geometry", geometry,
      "-background", "black",
      "-gravity", "center",
      outputFile,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await command.output();
  const errorOutput = new TextDecoder().decode(stderr);
  const standardOutput = new TextDecoder().decode(stdout);

  if (code === 0) {
    console.log("Montage created:", outputFile);
    console.log("Standard Output:", standardOutput); // Log standard output for debugging
  } else {
    console.error("Montage creation failed.");
    console.error("Error Output:", errorOutput); // Log error output for detailed error information
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

