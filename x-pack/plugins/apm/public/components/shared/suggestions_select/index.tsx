/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiComboBox, EuiComboBoxOptionOption } from '@elastic/eui';
import { throttle } from 'lodash';
import React, { useCallback, useState } from 'react';
import { FETCH_STATUS, useFetcher } from '../../../hooks/use_fetcher';

interface SuggestionsSelectProps {
  allOption?: EuiComboBoxOptionOption<string>;
  customOptionText?: string;
  defaultValue?: string;
  field: string;
  onChange: (value?: string) => void;
  isClearable?: boolean;
  isInvalid?: boolean;
  placeholder: string;
  dataTestSubj?: string;
}

export function SuggestionsSelect({
  allOption,
  customOptionText,
  defaultValue,
  field,
  onChange,
  placeholder,
  isInvalid,
  dataTestSubj,
  isClearable = true,
}: SuggestionsSelectProps) {
  let defaultOption: EuiComboBoxOptionOption<string> | undefined;

  if (defaultValue) {
    defaultOption = { label: defaultValue, value: defaultValue };
  }
  const [selectedOptions, setSelectedOptions] = useState(
    defaultOption ? [defaultOption] : []
  );

  const [searchValue, setSearchValue] = useState('');

  const { data, status } = useFetcher(
    (callApmApi) => {
      return callApmApi('GET /internal/apm/suggestions', {
        params: {
          query: { field, string: searchValue },
        },
      });
    },
    [field, searchValue],
    { preservePreviousData: false }
  );

  const handleChange = useCallback(
    (changedOptions: Array<EuiComboBoxOptionOption<string>>) => {
      setSelectedOptions(changedOptions);

      if (changedOptions.length === 0) {
        onChange('');
      }

      if (changedOptions.length === 1) {
        onChange(
          changedOptions[0].value
            ? changedOptions[0].value.trim()
            : changedOptions[0].value
        );
      }
    },
    [onChange]
  );

  const handleCreateOption = useCallback(
    (value: string) => {
      handleChange([{ label: value, value }]);
    },
    [handleChange]
  );

  const terms = data?.terms ?? [];

  const options: Array<EuiComboBoxOptionOption<string>> = [
    ...(allOption &&
    (searchValue === '' ||
      searchValue.toLowerCase() === allOption.label.toLowerCase())
      ? [allOption]
      : []),
    ...terms.map((name) => {
      return { label: name, value: name };
    }),
  ];

  return (
    <EuiComboBox
      async={true}
      customOptionText={customOptionText}
      isClearable={isClearable}
      isLoading={status === FETCH_STATUS.LOADING}
      onChange={handleChange}
      onSearchChange={throttle(setSearchValue, 500)}
      options={options}
      placeholder={placeholder}
      selectedOptions={selectedOptions}
      singleSelection={{ asPlainText: true }}
      isInvalid={isInvalid}
      style={{ minWidth: '256px' }}
      onCreateOption={handleCreateOption}
      data-test-subj={dataTestSubj}
    />
  );
}
