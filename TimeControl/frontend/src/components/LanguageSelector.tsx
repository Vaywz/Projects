import React from 'react';
import { Dropdown, Button } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { MenuProps } from 'antd';
import { languages } from '../i18n';

const LanguageSelector: React.FC = () => {
  const { i18n } = useTranslation();

  // Normalize language code (e.g., 'en-US' -> 'en')
  const normalizedLang = (i18n.language || 'lv').split('-')[0].toLowerCase();
  const currentLang = languages.find(lang => lang.code === normalizedLang) || languages[2]; // default to Latvian

  const items: MenuProps['items'] = languages.map(lang => ({
    key: lang.code,
    label: lang.name,
    onClick: () => {
      i18n.changeLanguage(lang.code);
      // Force localStorage update
      localStorage.setItem('i18nextLng', lang.code);
    },
  }));

  return (
    <Dropdown menu={{ items, selectedKeys: [normalizedLang] }} placement="bottomRight">
      <Button type="text" icon={<GlobalOutlined />}>
        <span style={{ marginLeft: 4 }}>{currentLang.name}</span>
      </Button>
    </Dropdown>
  );
};

export default LanguageSelector;