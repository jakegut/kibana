/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import type { UseQueryResult } from 'react-query';
import { render, screen } from '@testing-library/react';
import { of } from 'rxjs';
import { useKubebeatDataView } from '../../common/api/use_kubebeat_data_view';
import { Findings } from './findings';
import { TestProvider } from '../../test/test_provider';
import { DataPublicPluginStart } from '@kbn/data-plugin/public';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import { unifiedSearchPluginMock } from '@kbn/unified-search-plugin/public/mocks';
import { createStubDataView } from '@kbn/data-views-plugin/public/data_views/data_view.stub';
import { CSP_KUBEBEAT_INDEX_PATTERN } from '../../../common/constants';
import * as TEST_SUBJECTS from './test_subjects';
import { useCisKubernetesIntegration } from '../../common/api/use_cis_kubernetes_integration';
import type { DataView } from '@kbn/data-plugin/common';

jest.mock('../../common/api/use_kubebeat_data_view');
jest.mock('../../common/api/use_cis_kubernetes_integration');

beforeEach(() => {
  jest.restoreAllMocks();
});

const Wrapper = ({
  data = dataPluginMock.createStartContract(),
  unifiedSearch = unifiedSearchPluginMock.createStartContract(),
}: {
  data: DataPublicPluginStart;
  unifiedSearch: UnifiedSearchPublicPluginStart;
}) => (
  <TestProvider deps={{ data, unifiedSearch }}>
    <Findings />
  </TestProvider>
);

describe('<Findings />', () => {
  it("renders the success state component when 'kubebeat' DataView exists and request status is 'success'", async () => {
    const data = dataPluginMock.createStartContract();
    const unifiedSearch = unifiedSearchPluginMock.createStartContract();
    const source = await data.search.searchSource.create();

    (useCisKubernetesIntegration as jest.Mock).mockImplementation(() => ({
      data: { item: { status: 'installed' } },
    }));
    (source.fetch$ as jest.Mock).mockReturnValue(of({ rawResponse: { hits: { hits: [] } } }));

    (useKubebeatDataView as jest.Mock).mockReturnValue({
      status: 'success',
      data: createStubDataView({
        spec: {
          id: CSP_KUBEBEAT_INDEX_PATTERN,
        },
      }),
    } as UseQueryResult<DataView>);

    render(<Wrapper data={data} unifiedSearch={unifiedSearch} />);

    expect(await screen.findByTestId(TEST_SUBJECTS.FINDINGS_CONTAINER)).toBeInTheDocument();
  });
});
