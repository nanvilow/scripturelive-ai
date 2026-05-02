import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";

const REPO = "nanvilow/scripturelive-ai";
const FALLBACK_URL = `https://github.com/${REPO}/releases/latest`;

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  content_type?: string;
};

type ReleaseResponse = {
  assets?: ReleaseAsset[];
};

interface DownloadButtonProps {
  className?: string;
  size?: "default" | "sm" | "lg";
  showIcon?: boolean;
  label: string;
  loadingLabel?: string;
}

export function DownloadButton({
  className,
  size,
  showIcon = false,
  label,
  loadingLabel = "Starting download…",
}: DownloadButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/releases/latest`,
        { headers: { Accept: "application/vnd.github+json" } },
      );
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const data = (await res.json()) as ReleaseResponse;
      const exe = data.assets?.find((a) => /\.exe$/i.test(a.name));
      if (!exe?.browser_download_url) throw new Error("No .exe asset found");

      const a = document.createElement("a");
      a.href = exe.browser_download_url;
      a.download = exe.name;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.warn(
        "Direct download failed, falling back to releases page:",
        err,
      );
      window.location.href = FALLBACK_URL;
    } finally {
      setTimeout(() => setLoading(false), 1500);
    }
  }

  return (
    <Button
      onClick={handleClick}
      className={className}
      size={size}
      disabled={loading}
      aria-busy={loading}
    >
      {loading ? (
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      ) : showIcon ? (
        <Download className="mr-2 h-5 w-5" />
      ) : null}
      {loading ? loadingLabel : label}
    </Button>
  );
}
