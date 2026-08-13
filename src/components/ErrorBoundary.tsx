import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackMessage: string;
}

interface State {
  hasError: boolean;
}

// Slippi's API is undocumented and has changed shape before without
// notice (see README caveats) - if that happens again and some
// downstream component chokes on unexpected data mid-render, this stops
// it from blanking the whole page. Deliberately no error logging here:
// this project has no monitoring service to send it to, and console
// output nobody's watching isn't worth the added surface.
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    const { hasError } = this.state;
    const { children, fallbackMessage } = this.props;
    if (hasError) {
      return <div className="p-1 text-gray-300">{fallbackMessage}</div>;
    }
    return children;
  }
}
