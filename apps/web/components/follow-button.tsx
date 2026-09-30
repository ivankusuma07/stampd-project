"use client";

import { useState } from "react";
import { Button } from "@stampd/ui";
import { api } from "@/lib/api";
import { useSession } from "./providers";

export function FollowButton({ kolId, initial }: { kolId: string; initial: boolean }) {
  const { signedIn } = useSession();
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);
  if (!signedIn) return <p className="text-xs text-ink-3">Sign in to follow</p>;
  return (
    <Button
      variant={following ? "secondary" : "primary"}
      aria-pressed={following}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api(`/kols/${kolId}/follow`, { method: following ? "DELETE" : "PUT" });
          setFollowing(!following);
        } finally {
          setBusy(false);
        }
      }}
    >
      {following ? "Following" : "Follow"}
    </Button>
  );
}
