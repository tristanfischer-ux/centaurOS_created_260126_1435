import React from 'react';
import { View, Text } from '@react-pdf/renderer';
import { styles } from '../styles'; // Adjust import path depending on where DataAttribution is located
import type { PdfAttribution } from '../../types/render-contracts';

export function DataAttribution({ source, modelName }: PdfAttribution) {
  const isDb = source === 'db';
  const label = isDb ? 'DB' : `LLM${modelName ? ` | ${modelName}` : ''}`;
  const icon = isDb ? '⛁' : '✧'; // using unicode symbols that react-pdf can render if font supports it. Actually, react-pdf might drop emojis. Let's use simple ascii or rely on font. We'll use [ DB ] and [ LLM | gemini ] for safety.

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#f3f4f6', // light gray
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: '#e5e7eb',
      borderStyle: 'solid',
      marginLeft: 8,
    }}>
      <Text style={{
        fontFamily: 'Helvetica', // fallback font
        fontSize: 7,
        color: '#6b7280', // muted gray
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}>
        {icon} {label}
      </Text>
    </View>
  );
}
