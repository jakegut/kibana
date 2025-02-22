/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CoreSetup, CoreStart, Plugin } from '@kbn/core/server';
import { PluginSetupContract as FeaturesPluginSetup } from '@kbn/features-plugin/server';
import { UsageCollectionSetup } from '@kbn/usage-collection-plugin/server';
import { SecurityPluginSetup } from '@kbn/security-plugin/server';
import { savedObjectsTaggingFeature } from './features';
import { tagType } from './saved_objects';
import type { TagsHandlerContext } from './types';
import { TagsRequestHandlerContext } from './request_handler_context';
import { registerRoutes } from './routes';
import { createTagUsageCollector } from './usage';

interface SetupDeps {
  features: FeaturesPluginSetup;
  usageCollection?: UsageCollectionSetup;
  security?: SecurityPluginSetup;
}

export class SavedObjectTaggingPlugin implements Plugin<{}, {}, SetupDeps, {}> {
  public setup(
    { savedObjects, http }: CoreSetup,
    { features, usageCollection, security }: SetupDeps
  ) {
    savedObjects.registerType(tagType);

    const router = http.createRouter<TagsHandlerContext>();
    registerRoutes({ router });

    http.registerRouteHandlerContext<TagsHandlerContext, 'tags'>(
      'tags',
      async (context, req, res) => {
        return new TagsRequestHandlerContext(req, await context.core, security);
      }
    );

    features.registerKibanaFeature(savedObjectsTaggingFeature);

    if (usageCollection) {
      usageCollection.registerCollector(
        createTagUsageCollector({
          usageCollection,
          kibanaIndex: savedObjects.getKibanaIndex(),
        })
      );
    }

    return {};
  }

  public start(core: CoreStart) {
    return {};
  }
}
