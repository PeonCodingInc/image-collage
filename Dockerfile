# Use official Deno image
FROM denoland/deno:latest

# Install dependencies (ImageMagick & FFmpeg)
RUN apt-get update && apt-get install -y \
    coreutils imagemagick ffmpeg && \
    ln -s /usr/bin/montage /usr/bin/magick-montage && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

RUN mkdir -p /app/input /app/output

# Copy the script into the container
COPY main.ts .

RUN sed -i 's#<policy domain="resource" name="memory" value="256MiB"/>#<policy domain="resource" name="memory" value="2GiB"/>#g' /etc/ImageMagick-6/policy.xml && \
    sed -i 's#<policy domain="resource" name="map" value="512MiB"/>#<policy domain="resource" name="map" value="4GiB"/>#g' /etc/ImageMagick-6/policy.xml && \
    sed -i 's#<policy domain="resource" name="disk" value="1GiB"/>#<policy domain="resource" name="disk" value="10GiB"/>#g' /etc/ImageMagick-6/policy.xml


# Set default command
ENTRYPOINT ["deno", "run", "--allow-read", "--allow-write", "--allow-run=ffmpeg,ffprobe,nice,magick-montage", "/app/main.ts"]
