import { VideoMetadata } from '~/server/schema/media.schema';
import { createBlurHash } from '~/utils/blurhash';

const getVideoData = async (src: string) =>
  new Promise<VideoMetadata>((resolve, reject) => {
    const video = document.createElement('video');
    video.onloadedmetadata = function () {
      video.currentTime = 0;
    };
    video.onseeked = function () {
      const width = video.videoWidth;
      const height = video.videoHeight;
      console.log({ video });
      resolve({
        width,
        height,
        hash: createBlurHash(video, width, height),
        duration: Math.round(video.duration * 1000) / 1000,
      });
    };
    video.onerror = (...args) => reject(args);
    video.src = src;
  });

export const preprocessVideo = async (file: File) => {
  const objectUrl = URL.createObjectURL(file);
  const metadata = await getVideoData(objectUrl);

  return {
    objectUrl,
    metadata: {
      size: file.size,
      ...metadata,
    },
  };
};
