import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center py-20">
          <Card className="max-w-md w-full">
            <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <h2 className="text-heading-sm text-foreground">Something went wrong</h2>
                <p className="text-body-sm text-muted-foreground mt-1">
                  An unexpected error occurred. Please try again.
                </p>
              </div>
              {import.meta.env.DEV && this.state.error && (
                <pre className="w-full rounded-lg bg-muted p-3 text-xs text-muted-foreground overflow-auto max-h-32">
                  {this.state.error.message}
                </pre>
              )}
              <Button onClick={this.resetErrorBoundary}>Try Again</Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
