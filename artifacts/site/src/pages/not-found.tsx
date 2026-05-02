import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground px-6">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 text-primary mb-6">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-bold mb-3">Page not found</h1>
        <p className="text-muted-foreground mb-8">
          The page you were looking for doesn't exist.
        </p>
        <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
          <a href="/">Back to ScriptureLive AI</a>
        </Button>
      </div>
    </div>
  );
}
