import { parseArgs } from "jsr:@std/cli/parse-args";
import { dirname, join, basename, extname } from "https://deno.land/std@0.119.0/path/mod.ts";
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
}

// Call main with command line arguments
if (import.meta.main) {
  main(Deno.args);
}

function printHelp(): void {
  console.log(`
    Makes a image collage for all video files in targeted folder and all subfolders. Saves them in a /collage folder as .jpg file.

    Support for .mp4, .mkv, .avi, .mov, .flv, .wmv video formats.
    Usage: deno run --allow-read --allow-write --allow-run main.ts [options]

    Options:
      -h, --help                Show this help message
      -d, --directory <path>    Directory to scan for video files
      --k, --keep               Keep screenshots after creating collage (default: false)

    Example:
      deno run --allow-read --allow-write --allow-run main.ts -d /path/to/videos
  `);
}

function parseArguments(args: string[]): Args {
  return parseArgs(args, {
    boolean: ["help", "keep"],
    string: ["directory"],
    alias: {
      "help": "h",
      "directory": "d",
      "keep": "k"
    },
    default: { "keep": false }
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
    // Call createImageCollage with the directory path
    await createImageCollage(fixedPath, args.keep)
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

async function createImageCollage(inputPath: string, keep: boolean = false): Promise<void> {
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
  for (const file of mediaFiles) {
    console.log(`Processing ${file}...`);
    await captureScreenshotsFromFile(file, 8);
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
    if (movieScreenshots.length < 6) {
      console.log(`Skipping ${movieName}: Not enough screenshots (${movieScreenshots.length})`);
      continue;
    }

    // Sort screenshots by timestamp to ensure correct order
    movieScreenshots.sort((a, b) => {
      const timeA = parseInt(a.match(/\d+(?=min\.jpg)/)?.[0] || "0");
      const timeB = parseInt(b.match(/\d+(?=min\.jpg)/)?.[0] || "0");
      return timeA - timeB;
    });

    const chunks = chunkArray(movieScreenshots, 6);
    for (const chunk of chunks) {
      if (chunk.length === 6) { // Only create montage if we have exactly 6 screenshots
        const collageDir = await ensureCollageDirectory(chunk[0]);
        const outputFile = join(collageDir, `${movieName}-collage.jpg`);
        console.log(`Creating collage for ${movieName}`);
        await createMontage(outputFile, chunk);
        createdCollages.push(outputFile);
      }
    }
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

async function captureScreenshotsFromFile(videoFile: string, intervalMinutes: number) {
  const screenshotMaxAmount = 6;
  const maxRetries = 3;

  const duration = await getVideoDuration(videoFile);
  if (duration < 30 * 60) {
    console.log(`Skipping ${videoFile}, duration is less than 30 minutes.`);
    return;
  }

  for (let i = 1; i <= screenshotMaxAmount; i++) {
    const time = new Date(i * intervalMinutes * 60 * 1000).toISOString().substr(11, 8);
    const dirName = dirname(videoFile);
    const fileNameWithoutExt = basename(videoFile, extname(videoFile));
    const outputFile = join(dirName, `${fileNameWithoutExt}-screenshot-${i * intervalMinutes}min.jpg`);

    let attempt = 0;
    let success = false;

    while (attempt < maxRetries && !success) {
      attempt++;

      const command = new Deno.Command("ffmpeg", {
        args: ["-y", "-ss", time, "-i", videoFile, "-vframes", "1", "-q:v", "6", outputFile],
        stdout: "null",
        stderr: "null"
      });

      const { code } = await command.output();
      if (code === 0) {
        success = true;
      } else {
        console.error(`Retry ${attempt}: Failed screenshot at ${time} for ${videoFile}`);
      }
    }
  }
  console.log(`Captured screenshot for ${videoFile}`);
}

async function ensureCollageDirectory(inputPath: string): Promise<string> {
  const collageDir = join(dirname(inputPath), "collages");
  await ensureDir(collageDir);
  return collageDir;
}

async function createMontage(outputFile: string, inputFiles: string[]) {
  if (inputFiles.length !== 6) {
    console.error("Exactly 6 input files are required to create the montage.");
    return;
  }

  const outputDir = dirname(outputFile);
  await ensureDir(outputDir);

  const command = new Deno.Command("magick", {
    args: [
      "montage",
      ...inputFiles,
      "-tile", "3x2",
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

