declare module 'react-native-vector-icons/MaterialCommunityIcons' {
  import {Component} from 'react';
  import {TextStyle, ViewStyle} from 'react-native';

  interface IconProps {
    name: string;
    size?: number;
    color?: string;
    style?: TextStyle | ViewStyle;
  }

  export default class Icon extends Component<IconProps> {}
}

declare module '@env' {
  export const API_URL: string;
  export const WS_URL: string;
  export const GOOGLE_WEB_CLIENT_ID: string;
}
