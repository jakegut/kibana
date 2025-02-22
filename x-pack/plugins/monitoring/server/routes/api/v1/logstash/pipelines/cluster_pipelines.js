/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { getClusterStatus } from '../../../../../lib/logstash/get_cluster_status';
import { handleError } from '../../../../../lib/errors';
import { getPaginatedPipelines } from '../../../../../lib/logstash/get_paginated_pipelines';

/**
 * Retrieve pipelines for a cluster
 */
export function logstashClusterPipelinesRoute(server) {
  server.route({
    method: 'POST',
    path: '/api/monitoring/v1/clusters/{clusterUuid}/logstash/pipelines',
    config: {
      validate: {
        params: schema.object({
          clusterUuid: schema.string(),
        }),
        body: schema.object({
          ccs: schema.maybe(schema.string()),
          timeRange: schema.object({
            min: schema.string(),
            max: schema.string(),
          }),
          pagination: schema.object({
            index: schema.number(),
            size: schema.number(),
          }),
          sort: schema.maybe(
            schema.object({
              field: schema.string(),
              direction: schema.string(),
            })
          ),
          queryText: schema.string({ defaultValue: '' }),
        }),
      },
    },
    handler: async (req) => {
      const { pagination, sort, queryText } = req.payload;
      const clusterUuid = req.params.clusterUuid;

      const throughputMetric = 'logstash_cluster_pipeline_throughput';
      const nodesCountMetric = 'logstash_cluster_pipeline_nodes_count';

      // Mapping client and server metric keys together
      const sortMetricSetMap = {
        latestThroughput: throughputMetric,
        latestNodesCount: nodesCountMetric,
      };
      if (sort) {
        sort.field = sortMetricSetMap[sort.field] || sort.field;
      }
      try {
        const response = await getPaginatedPipelines({
          req,
          clusterUuid,
          metrics: { throughputMetric, nodesCountMetric },
          pagination,
          sort,
          queryText,
        });

        return {
          ...response,
          clusterStatus: await getClusterStatus(req, { clusterUuid }),
        };
      } catch (err) {
        throw handleError(err, req);
      }
    },
  });
}
