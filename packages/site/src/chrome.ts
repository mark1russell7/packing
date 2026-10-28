// The parts that each page of the site has: the links of the header and the theme button.

/** The pages of the site that the header links to */
export type PageId = "demo" | "results" | "whats-new" | "status" | "releases";

/** One link of the header */
export interface NavLink {
  id: PageId | "source";
  label: string;
  href: string;
  /** The value `true` for the link of the page that shows it */
  current: boolean;
}

/** The address of the source on GitHub */
export const SOURCE_URL = "https://github.com/mark1russell7/packing";

/**
 * This function gives the links of the header for a base path and the current page.
 * The deploy of the site makes the pages `status/` and `releases/`. A local build does not have them.
 */
export function navLinks(base: string, current: PageId): NavLink[] {
  const root = base.endsWith("/") ? base : `${base}/`;
  const pages: [PageId, string, string][] = [
    ["demo", "Demo", root],
    ["results", "Results", `${root}results/`],
    ["whats-new", "What's new", `${root}whats-new/`],
    ["status", "Status", `${root}status/`],
    ["releases", "Releases", `${root}releases/`],
  ];
  return [
    ...pages.map(([id, label, href]) => ({ id, label, href, current: id === current })),
    { id: "source", label: "Source on GitHub", href: SOURCE_URL, current: false },
  ];
}

/** The themes of the theme button, in the order of the clicks */
export const THEMES = ["auto", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

/** This function sets a theme on the page and keeps it for the next visit. */
function setTheme(button: HTMLButtonElement, theme: Theme): void {
  if (theme === "auto") delete document.documentElement.dataset["theme"];
  else document.documentElement.dataset["theme"] = theme;
  button.textContent = `Theme: ${theme}`;
  try {
    localStorage.setItem("packing-theme", theme);
  } catch {
    // A private window can refuse the storage. The theme then lasts only for this visit.
  }
}

/** This function connects the theme button. The saved theme of the last visit applies first. */
export function mountTheme(button: HTMLButtonElement): void {
  let theme: Theme = "auto";
  try {
    const saved = localStorage.getItem("packing-theme");
    if (saved === "light" || saved === "dark") theme = saved;
  } catch {
    // No storage: the theme follows the system.
  }
  setTheme(button, theme);
  button.addEventListener("click", () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]!;
    setTheme(button, theme);
  });
}

/**
 * This function fills the links of the header and connects the theme button. The element `nav` gets the links before
 * its first child, so a page can keep its own links after them.
 */
export function mountChrome(nav: HTMLElement, current: PageId): void {
  const links = navLinks(import.meta.env.BASE_URL, current);
  const first = nav.firstChild;
  for (const link of links) {
    const a = document.createElement("a");
    a.href = link.href;
    a.textContent = link.label;
    if (link.current) a.setAttribute("aria-current", "page");
    nav.insertBefore(a, first);
  }
  let button = nav.querySelector<HTMLButtonElement>("button.theme");
  if (button === null) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "theme";
    button.setAttribute("aria-label", "Color theme");
    nav.append(button);
  }
  mountTheme(button);
}
