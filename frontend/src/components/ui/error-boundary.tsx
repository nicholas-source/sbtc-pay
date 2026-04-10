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
  retryCount: number;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  resetErrorBoundary = () => {
    this.setState((prev) => ({ hasError: false, error: null, retryCount: prev.retryCount + 1 }));
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const isNetworkError = this.state.error?.message?.toLowerCase().includes("fetch") ||
        this.state.error?.message?.toLowerCase().includes("network") ||
        this.state.error?.message?.toLowerCase().includes("load");
      const hasRetriedTooMuch = this.state.retryCount >= 3;

      return (
        <div className="flex items-center justify-center py-20" role="alert">
          <Card className="max-w-md w-full">
            <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <h2 className="text-heading-sm text-foreground">Something went wrong</h2>
                <p className="text-body-sm text-muted-foreground mt-1">
                  {isNetworkError
                    ? "A network error occurred. Check your connection and try again."
                    : "An unexpected error occurred. Please try again."}
                </p>
                {hasRetriedTooMuch && (
                  <p className="text-body-sm text-muted-foreground mt-2">
                    Still having issues? Try refreshing the page.
                  </p>
                )}
              </div>
              {import.meta.env.DEV && this.state.error && (
                <pre className="w-full rounded-lg bg-muted p-3 text-xs text-muted-foreground overflow-auto max-h-32">
                  {this.state.error.message}
                </pre>
              )}
              <div className="flex gap-2">
                <Button onClick={this.resetErrorBoundary}>Try Again</Button>
                {hasRetriedTooMuch && (
                  <Button variant="outline" onClick={() => window.location.reload()}>
                    Refresh Page
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
