import { client } from '~/server/meilisearch/client';
import { getOrCreateIndex } from '~/server/meilisearch/util';
import { EnqueuedTask } from 'meilisearch';
import {
  createSearchIndexUpdateProcessor,
  SearchIndexRunContext,
} from '~/server/search-index/base.search-index';
import { MetricTimeframe } from '@prisma/client';
import { userWithCosmeticsSelect } from '~/server/selectors/user.selector';

const READ_BATCH_SIZE = 1000;
const INDEX_ID = 'creators';
const SWAP_INDEX_ID = `${INDEX_ID}_NEW`;

const onIndexSetup = async ({ indexName }: { indexName: string }) => {
  if (!client) {
    return;
  }

  const index = await getOrCreateIndex(indexName);
  console.log('onIndexSetup :: Index has been gotten or created', index);

  if (!index) {
    return;
  }

  const updateSearchableAttributesTask = await index.updateSearchableAttributes(['username']);

  console.log(
    'onIndexSetup :: updateSearchableAttributesTask created',
    updateSearchableAttributesTask
  );

  const sortableFieldsAttributesTask = await index.updateSortableAttributes([
    'creation_date',
    'rank.ratingAllTimeRank',
    'rank.ratingCountAllTimeRank',
    'rank.followerCountAllTimeRank',
    'rank.favoriteCountAllTimeRank',
    'rank.answerAcceptCountAllTimeRank',
    'rank.answerCountAllTimeRank',
    'rank.downloadCountAllTimeRank',
    'metrics.followerCount',
    'metrics.uploadCount',
    'metrics.followingCount',
    'metrics.reviewCount',
    'metrics.answerAcceptCount',
    'metrics.hiddenCount',
  ]);

  console.log('onIndexSetup :: sortableFieldsAttributesTask created', sortableFieldsAttributesTask);

  await client.waitForTasks([
    updateSearchableAttributesTask.taskUid,
    sortableFieldsAttributesTask.taskUid,
  ]);

  console.log('onIndexSetup :: all tasks completed');
};

const onIndexUpdate = async ({ db, lastUpdatedAt, indexName }: SearchIndexRunContext) => {
  if (!client) return;

  // Confirm index setup & working:
  await onIndexSetup({ indexName });

  let offset = 0;
  const tagTasks: EnqueuedTask[] = [];

  const queuedItems = await db.searchIndexUpdateQueue.findMany({
    select: {
      id: true,
    },
    where: {
      type: INDEX_ID,
    },
  });

  while (true) {
    const users = await db.user.findMany({
      skip: offset,
      take: READ_BATCH_SIZE,
      select: {
        ...userWithCosmeticsSelect,
        rank: {
          select: {
            ratingAllTimeRank: true,
            ratingCountAllTimeRank: true,
            followerCountAllTimeRank: true,
            favoriteCountAllTimeRank: true,
            answerAcceptCountAllTimeRank: true,
            answerCountAllTimeRank: true,
            downloadCountAllTimeRank: true,
          },
        },
        metrics: {
          select: {
            followerCount: true,
            uploadCount: true,
            followingCount: true,
            reviewCount: true,
            answerAcceptCount: true,
            hiddenCount: true,
          },
          where: {
            timeframe: MetricTimeframe.AllTime,
          },
        },
      },
      where: {
        deletedAt: null,
        // if lastUpdatedAt is not provided,
        // this should generate the entirety of the index.
        OR: !lastUpdatedAt
          ? undefined
          : [
              {
                createdAt: {
                  gt: lastUpdatedAt,
                },
              },
              {
                id: {
                  in: queuedItems.map(({ id }) => id),
                },
              },
            ],
      },
    });

    // Avoids hitting the DB without data.
    if (users.length === 0) break;

    const indexReadyRecords = users.map((userRecord) => {
      return {
        ...userRecord,
        metrics: {
          // Flattens metric array
          ...(userRecord.metrics[0] || {}),
        },
      };
    });

    tagTasks.push(await client.index(`${INDEX_ID}`).updateDocuments(indexReadyRecords));

    console.log('onIndexUpdate :: task pushed to queue');

    offset += users.length;
  }

  console.log('onIndexUpdate :: start waitForTasks');
  await client.waitForTasks(tagTasks.map((task) => task.taskUid));
  console.log('onIndexUpdate :: complete waitForTasks');
};

export const creatorsSearchIndex = createSearchIndexUpdateProcessor({
  indexName: INDEX_ID,
  swapIndexName: SWAP_INDEX_ID,
  onIndexUpdate,
  onIndexSetup,
});
