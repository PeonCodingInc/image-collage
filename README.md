# Description
Makes a image collage for all video files in targeted folder and all subfolders. Saves them in a /collage folder as .jpg file.

Support for .mp4, .mkv, .avi, .mov, .flv, .wmv video formats.

Doesn't process movies shorter then 30 min.
### Usage
Go to the root folder and type **deno run** on the main file. The permissionss are required for the code to run. 

```
deno run --allow-read --allow-write --allow-run=ffmpeg,ffprobe,magick main.ts -d "/path/to/videos"
```

Make sure the path is correct and is either using single slash `C:/Users/Videos` or double backslash `C:\\Users\\Videos`
## Prerequisites

This tool requires the following software to be installed:

- [FFmpeg](https://ffmpeg.org/) - A complete cross-platform solution for video handling
- [ImageMagick](https://imagemagick.org/) - Software suite for displaying, converting, and editing image files
- [Deno](https://docs.deno.com/runtime/getting_started/installation/) - Javascript runtime

### Installation

#### Windows
The easiest way to install the prerequisites on Windows is using [Chocolatey](https://chocolatey.org/):

```powershell
choco install ffmpeg imagemagick deno -y 
```

Alternatively, you can install Deno using PowerShell:
```powershell
irm https://deno.land/install.ps1 | iex
```

#### macOS
Using [Homebrew](https://brew.sh/):

```bash
brew install ffmpeg imagemagick deno
```

#### Linux
On Debian/Ubuntu:

```bash
sudo apt update
sudo apt install ffmpeg imagemagick
# Install Deno
curl -fsSL https://deno.land/x/install/install.sh | sh
```

On Fedora:

```bash
sudo dnf install ffmpeg imagemagick
# Install Deno
curl -fsSL https://deno.land/x/install/install.sh | sh
```

On Arch Linux:

```bash
sudo pacman -S ffmpeg imagemagick deno
```

Double check if ffmpeg imagemagick and deno can be run in the terminal.
