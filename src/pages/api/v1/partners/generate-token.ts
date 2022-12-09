import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '~/server/db/client';
import { z } from 'zod';
import { ModEndpoint } from '~/server/utils/endpoint-helpers';
import { generateKey, generateSecretHash } from '~/server/utils/key-generator';

const schema = z.object({ partnerId: z.preprocess((val) => Number(val), z.number()) });

export default ModEndpoint(
  async function importSource(req: NextApiRequest, res: NextApiResponse) {
    const { partnerId } = schema.parse(req.query);
    const token = generateKey();
    console.log(token);
    const hash = generateSecretHash(token);

    await prisma.partner.updateMany({
      where: { id: partnerId },
      data: { token: hash },
    });

    res.status(200).json({ token });
  },
  ['GET']
);