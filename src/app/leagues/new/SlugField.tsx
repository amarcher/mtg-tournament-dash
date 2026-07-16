"use client";

import { useState } from "react";

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function SlugField() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  return (
    <>
      <div>
        <label
          htmlFor="league-name"
          className="mb-1 block text-sm font-medium text-zinc-300"
        >
          League name
        </label>
        <input
          id="league-name"
          name="name"
          required
          placeholder="Lexington Dads Magic Draft"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm focus:border-amber-500 focus:outline-none"
        />
      </div>
      <div>
        <label
          htmlFor="league-slug"
          className="mb-1 block text-sm font-medium text-zinc-300"
        >
          URL
        </label>
        <div className="flex items-center gap-1">
          <span className="text-sm text-zinc-500">/leagues/</span>
          <input
            id="league-slug"
            name="slug"
            required
            pattern="[a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9]"
            placeholder="lexington-dads"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2.5 font-mono text-sm focus:border-amber-500 focus:outline-none"
          />
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Lowercase letters, numbers, and hyphens. This is the link you share.
        </p>
      </div>
    </>
  );
}
