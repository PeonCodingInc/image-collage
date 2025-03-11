# Ensure at least one argument is provided
if ($args.Count -lt 2) {
    Write-Host "Usage: $($MyInvocation.MyCommand.Name) <input_directory> <output_directory> [extra_flags]"
    docker run --rm imagecollage-app --help
    exit 1
}

$InputDir = $args[0]
$OutputDir = $args[1]
$ExtraFlags = $args[2..($args.Count-1)]

# Check for help flag or no extra flags
if ($ExtraFlags -match "-h|--help" -or $ExtraFlags.Count -eq 0) {
    docker run --rm imagecollage-app --help
    exit 0
}

# Check if input directory exists
if (-not (Test-Path -Path $InputDir -PathType Container)) {
    Write-Host "Error: Input directory '$InputDir' does not exist!"
    exit 1
}

# Check if output directory exists
if (-not (Test-Path -Path $OutputDir -PathType Container)) {
    Write-Host "Error: Output directory '$OutputDir' does not exist!"
    exit 1
}

# Convert Windows-style paths to Docker-friendly paths
function Convert-ToDockerPath {
    param([string]$Path)
    
    $AbsolutePath = Resolve-Path $Path
    $DriveLetter = $AbsolutePath.Path.Substring(0, 1).ToLower()
    $DockerPath = $AbsolutePath.Path.Replace("\", "/").Replace(":", "")
    return "/mnt/$DriveLetter$DockerPath"
}

$DockerInputDir = Convert-ToDockerPath $InputDir
$DockerOutputDir = Convert-ToDockerPath $OutputDir

# Log the paths for verification
Write-Host "Input Directory: $DockerInputDir"
Write-Host "Output Directory: $DockerOutputDir"

# Run the container
$DockerArgs = @(
    "run",
    "--rm",
    "-v",
    "${InputDir}:/app/input",
    "-v",
    "${OutputDir}:/app/output",
    "imagecollage-app",
    "-d",
    "/app/input",
    "-o",
    "/app/output"
)

if ($ExtraFlags) {
    $DockerArgs += $ExtraFlags
}

docker $DockerArgs