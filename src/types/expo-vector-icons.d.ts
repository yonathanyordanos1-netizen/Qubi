declare module '@expo/vector-icons' {
  import { ComponentType } from 'react';
  import { TextProps } from 'react-native';
  export const Ionicons: ComponentType<{
    name: string;
    size?: number;
    color?: string;
    style?: any;
  }> & { glyphMap: Record<string, number> };
}
