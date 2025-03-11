# Description
Makes a image collage for all video files OR image files in targeted folder and all subfolders. Saves them in targeted folder as .jpg file.

Video format support: .mp4, .mkv, .avi, .mov, .flv, .wmv <br>
Image format support: .jpg, .jpeg, .png <br>
Usage: ./run_app.sh [options] <br>

![Hero Collage](images/hero-collage.jpg)
*Image credit: Blender Foundation*

### Usage

[Docker](https://www.docker.com/) is required, tested with version 26.1.1 <br>

Go to the root folder and type 

```
docker build -t imagecollage-app .
```
That will build an image from the dockerfile which can be used to create an container. <br>
#### Example video: Make collages of videos that are over 6 minutes long from F:/videos and subfolders in the folder that the command was executed in with 4x3 layout
```
./run_app.sh "F:/videos" "./collages" -c "4x3"      -l 360
```

#### Example image: Creates a collage in "F:/pictures/" for pictures in "F:/pictures/collages" with 10x5 layout:
```
./run_app.sh "F:/pictures/" "F:/pictures/collages"  -i -c "10x5"
```
Make sure the path is correct and is either using single slash `F:/Videos` or double backslash `F:\\Videos`

For more specific details on run following command in terminal
```
./run_app.sh --help
```
## 
- [FFmpeg](https://ffmpeg.org/) - A complete cross-platform solution for video handling. Used for taking screenshots of video files and also dynamically changing the interval based on video length.
- [ImageMagick](https://imagemagick.org/) - Software suite for displaying, converting, and editing image files. Used for creating the collage.
- [Deno](https://docs.deno.com/runtime/getting_started/installation/) - Javascript runtime

## Contact
For any business inquiries or feedback: <peoncoding@gmail.com> <br>

## Donations
<a href="https://ko-fi.com/codingpeon" target="_blank">
  <img src="images/kofi.png" alt="Kofi" style="width:100px;">
</a>