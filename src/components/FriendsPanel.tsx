"use client";

import { Check, Copy, Link as LinkIcon, Trash2, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { MoviePoster } from "@/components/MoviePoster";
import type { Friend, FriendInvite, Movie, Profile } from "@/lib/types";

interface InviteWithUrl extends FriendInvite {
  url: string;
}

interface CommonView {
  friend: Friend;
  commonLoved: Movie[];
  sharedWatchlist: Movie[];
  friendLovedUnseen: Movie[];
}

function MovieStrip({ title, movies, emptyCopy }: { title: string; movies: Movie[]; emptyCopy: string }) {
  return (
    <div className="friend-strip">
      <h4>{title}</h4>
      {movies.length ? (
        <div className="friend-movie-grid">
          {movies.slice(0, 18).map((movie) => (
            <div className="friend-poster" key={movie.tmdbId} title={movie.title}>
              <MoviePoster movie={movie} />
            </div>
          ))}
        </div>
      ) : (
        <p className="friend-strip-empty">{emptyCopy}</p>
      )}
    </div>
  );
}

export function FriendsPanel() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  // Shown once, right after creation - links are never listed again.
  const [invite, setInvite] = useState<InviteWithUrl | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [commonById, setCommonById] = useState<Map<string, CommonView>>(new Map());
  const [commonLoading, setCommonLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [profileRes, friendsRes] = await Promise.all([
        fetch("/api/profile", { cache: "no-store" }),
        fetch("/api/friends", { cache: "no-store" })
      ]);
      if (profileRes.ok) {
        const data = (await profileRes.json()) as { profile: Profile | null };
        setProfile(data.profile);
        setNameDraft(data.profile?.displayName ?? "");
      }
      if (friendsRes.ok) setFriends(((await friendsRes.json()) as { friends: Friend[] }).friends);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveDisplayName = useCallback(async () => {
    const displayName = nameDraft.trim();
    if (!displayName || nameSaving) return;
    setNameSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName })
      });
      if (response.ok) {
        const data = (await response.json()) as { profile: Profile };
        setProfile(data.profile);
        setNameDraft(data.profile.displayName ?? "");
      }
    } finally {
      setNameSaving(false);
    }
  }, [nameDraft, nameSaving]);

  const createInvite = useCallback(async () => {
    if (inviteBusy) return;
    setInviteBusy(true);
    try {
      const response = await fetch("/api/friends/invites", { method: "POST" });
      if (!response.ok) return;
      const data = (await response.json()) as { invite: FriendInvite; url: string };
      setInvite({ ...data.invite, url: data.url });
      try {
        await navigator.clipboard.writeText(data.url);
        setCopiedToken(data.invite.token);
        setTimeout(() => setCopiedToken(null), 2500);
      } catch {
        // Clipboard unavailable; the copy button still works.
      }
    } finally {
      setInviteBusy(false);
    }
  }, [inviteBusy]);

  const copyInvite = useCallback(async (current: InviteWithUrl) => {
    try {
      await navigator.clipboard.writeText(current.url);
      setCopiedToken(current.token);
      setTimeout(() => setCopiedToken(null), 2500);
    } catch {
      // Ignore; user can copy manually from the visible URL.
    }
  }, []);

  const revokeInvite = useCallback(async (token: string) => {
    await fetch(`/api/friends/invites?token=${encodeURIComponent(token)}`, { method: "DELETE" });
    setInvite((current) => (current?.token === token ? null : current));
  }, []);

  const toggleCommon = useCallback(
    async (friend: Friend) => {
      if (expandedId === friend.profileId) {
        setExpandedId(null);
        return;
      }
      setExpandedId(friend.profileId);
      if (commonById.has(friend.profileId)) return;
      setCommonLoading(true);
      try {
        const response = await fetch(`/api/friends/${encodeURIComponent(friend.profileId)}/common`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as CommonView;
        setCommonById((current) => new Map(current).set(friend.profileId, data));
      } finally {
        setCommonLoading(false);
      }
    },
    [commonById, expandedId]
  );

  const removeFriend = useCallback(async (friend: Friend) => {
    await fetch(`/api/friends?profileId=${encodeURIComponent(friend.profileId)}`, { method: "DELETE" });
    setFriends((current) => current.filter((entry) => entry.profileId !== friend.profileId));
    setExpandedId((current) => (current === friend.profileId ? null : current));
  }, []);

  return (
    <section className="friends-panel" aria-labelledby="friends-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Watch together</p>
          <h1 id="friends-heading">Friends</h1>
        </div>
      </div>

      <div className="friends-card">
        <h3>Your profile</h3>
        <p className="friends-card-copy">Friends see this name next to your shared taste.</p>
        <div className="friends-name-row">
          <input
            type="text"
            value={nameDraft}
            maxLength={40}
            placeholder="Display name"
            onChange={(event) => setNameDraft(event.target.value)}
            aria-label="Display name"
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => void saveDisplayName()}
            disabled={nameSaving || !nameDraft.trim() || nameDraft.trim() === (profile?.displayName ?? "")}
          >
            Save
          </button>
        </div>
      </div>

      <div className="friends-card">
        <h3>Invite a friend</h3>
        <p className="friends-card-copy">
          One link at a time - creating a new one replaces the old. Links expire after 7 days, and whoever signs up or
          signs in through yours becomes a friend automatically.
        </p>
        <button type="button" className="secondary-button" onClick={() => void createInvite()} disabled={inviteBusy}>
          <LinkIcon size={16} /> {invite ? "Create new link" : "Create invite link"}
        </button>
        {invite && (
          <ul className="friends-invite-list">
            <li key={invite.token}>
              <span className="friends-invite-url" title={invite.url}>
                {invite.url}
              </span>
              <button type="button" className="icon-chip" onClick={() => void copyInvite(invite)} aria-label="Copy invite link">
                {copiedToken === invite.token ? <Check size={15} /> : <Copy size={15} />}
              </button>
              <button type="button" className="icon-chip" onClick={() => void revokeInvite(invite.token)} aria-label="Revoke invite">
                <Trash2 size={15} />
              </button>
            </li>
          </ul>
        )}
      </div>

      <div className="friends-card">
        <h3>
          <Users size={16} /> Your friends
        </h3>
        {loading && <p className="friends-card-copy">Loading…</p>}
        {!loading && friends.length === 0 && (
          <p className="friends-card-copy">No friends yet. Share an invite link to compare taste.</p>
        )}
        <ul className="friends-list">
          {friends.map((friend) => (
            <li key={friend.profileId}>
              <div className="friends-row">
                <div>
                  <strong>{friend.displayName ?? "Unnamed friend"}</strong>
                  <span className="friends-since">since {new Date(friend.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="friends-row-actions">
                  <button type="button" className="secondary-button" onClick={() => void toggleCommon(friend)}>
                    {expandedId === friend.profileId ? "Hide common taste" : "Common taste"}
                  </button>
                  <button type="button" className="icon-chip" onClick={() => void removeFriend(friend)} aria-label={`Remove ${friend.displayName ?? "friend"}`}>
                    <X size={15} />
                  </button>
                </div>
              </div>
              {expandedId === friend.profileId && (
                <div className="friend-common">
                  {commonLoading && !commonById.has(friend.profileId) && <p className="friends-card-copy">Comparing taste…</p>}
                  {commonById.has(friend.profileId) && (
                    <>
                      <MovieStrip
                        title="You both loved"
                        movies={commonById.get(friend.profileId)!.commonLoved}
                        emptyCopy="No overlapping favorites yet."
                      />
                      <MovieStrip
                        title="You both want to watch"
                        movies={commonById.get(friend.profileId)!.sharedWatchlist}
                        emptyCopy="No shared watchlist picks yet."
                      />
                      <MovieStrip
                        title={`${friend.displayName ?? "They"} loved - you haven't seen`}
                        movies={commonById.get(friend.profileId)!.friendLovedUnseen}
                        emptyCopy="Nothing to borrow from their favorites right now."
                      />
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
