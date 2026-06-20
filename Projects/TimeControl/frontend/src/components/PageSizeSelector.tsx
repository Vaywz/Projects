import React, { useState } from 'react';
import { Select, InputNumber, Space } from 'antd';
import { useTranslation } from 'react-i18next';

interface PageSizeSelectorProps {
  value: number;
  total: number;
  onChange: (size: number) => void;
}

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

const PageSizeSelector: React.FC<PageSizeSelectorProps> = ({ value, total, onChange }) => {
  const { t } = useTranslation();
  const [customInput, setCustomInput] = useState(false);

  const isCustom = !PAGE_SIZE_OPTIONS.includes(value) && value !== total;

  return (
    <Space size={4}>
      <Select
        value={isCustom ? 'custom' : (value === total ? 'all' : value)}
        onChange={(val) => {
          if (val === 'all') {
            setCustomInput(false);
            onChange(total || 9999);
          } else if (val === 'custom') {
            setCustomInput(true);
          } else {
            setCustomInput(false);
            onChange(val as number);
          }
        }}
        style={{ width: 70 }}
        size="small"
      >
        {PAGE_SIZE_OPTIONS.map((opt) => (
          <Select.Option key={opt} value={opt}>
            {opt}
          </Select.Option>
        ))}
        <Select.Option value="all">{t('common.all')}</Select.Option>
        <Select.Option value="custom">✎</Select.Option>
      </Select>
      {(customInput || isCustom) && (
        <InputNumber
          size="small"
          min={1}
          max={9999}
          value={isCustom ? value : undefined}
          placeholder="..."
          style={{ width: 60 }}
          onChange={(val) => {
            if (val && typeof val === 'number' && val > 0) {
              onChange(val);
            }
          }}
          onPressEnter={(e) => {
            const val = parseInt((e.target as HTMLInputElement).value);
            if (!isNaN(val) && val > 0) {
              onChange(val);
            }
          }}
        />
      )}
    </Space>
  );
};

export default PageSizeSelector;
