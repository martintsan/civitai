import { NextApiRequest, NextApiResponse } from 'next';
import { getGetUrl } from '~/utils/s3-utils';
import { ModelFileType, UserActivityType } from '@prisma/client';
import { getServerAuthSession } from '~/server/common/get-server-auth-session';
import { prisma } from '~/server/db/client';

export default async function downloadTrainingData(req: NextApiRequest, res: NextApiResponse) {
  const modelVersionId = req.query.modelVersionId as string;
  if (!modelVersionId) {
    return res.status(400).json({ error: 'Missing modelVersionId' });
  }

  const modelVersion = await prisma.modelVersion.findFirst({
    where: { id: parseInt(modelVersionId) },
    select: {
      model: { select: { id: true, name: true } },
      name: true,
      files: { where: { type: ModelFileType.TrainingData }, select: { url: true } },
    },
  });
  if (!modelVersion || !modelVersion.files.length) {
    return res.status(404).json({ error: 'Training data not found' });
  }

  const session = await getServerAuthSession({ req, res });
  const userId = session?.user?.id;
  if (!userId) {
    if (req.headers['content-type'] === 'application/json')
      return res.status(401).json({ error: 'Unauthorized' });
    else return res.redirect(`/login?returnUrl=/models/${modelVersion.model.id}`);
  }

  // Track activity
  try {
    await prisma.userActivity.create({
      data: {
        userId,
        activity: UserActivityType.TrainingDataDownload,
        details: { modelId: modelVersion.model.id, modelVersionId },
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Invalid database operation', cause: error });
  }

  const [trainingDataFile] = modelVersion.files;
  const { url } = await getGetUrl(trainingDataFile.url);

  res.redirect(url);
}
