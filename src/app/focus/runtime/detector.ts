import { headPose, noseRel } from '../../../lib/focus/classify';
import type { FocusSample } from '../../../lib/focus/types';
import type { Detector, Frame } from './controller';

/**
 * MediaPipe Tasks (vision), loaded only when Focus watch first starts. The WASM runtime comes from
 * jsDelivr (pinned to the installed package version) and the models from Google's official
 * mediapipe-models bucket — ~31 MB in total, too big to commit and self-host. Models run on the CPU
 * delegate so they keep working in a background tab. Nothing is sent anywhere: only these files
 * are downloaded; frames are processed locally.
 */
const TASKS_VISION_VERSION = '1.0.1'; // keep in sync with package.json
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const OBJECT_MODEL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite';

export async function loadDetector(): Promise<Detector> {
  const vision = await import('@mediapipe/tasks-vision');
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
  const [face, objects] = await Promise.all([
    vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'CPU' },
      runningMode: 'IMAGE',
      numFaces: 1,
      outputFacialTransformationMatrixes: true,
    }),
    vision.ObjectDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: OBJECT_MODEL, delegate: 'CPU' },
      runningMode: 'IMAGE',
      maxResults: 3,
      scoreThreshold: 0.3,
      categoryAllowlist: ['cell phone'],
    }),
  ]);

  return {
    /** One pass of each model on one small frame; returns numbers only. */
    detect(frame: Frame): FocusSample {
      const image = frame as unknown as ImageBitmap;
      const f = face.detect(image);
      const o = objects.detect(image);
      const phoneScore = Math.max(0, ...o.detections.flatMap((d) => d.categories.filter((c) => c.categoryName === 'cell phone').map((c) => c.score)));
      const landmarks = f.faceLandmarks[0];
      const matrix = f.facialTransformationMatrixes?.[0]?.data;
      if (!landmarks || !matrix) return { phoneScore };
      const { yaw, pitch } = headPose(matrix);
      return { face: { yaw, pitch, noseRel: noseRel(landmarks) }, phoneScore };
    },
    close() {
      face.close();
      objects.close();
    },
  };
}
