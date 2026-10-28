"use client";
// Editor of the site's menus: titles (БГ / RO), where each link leads, order and sub-menus.
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, ListIndentDecrease, ListIndentIncrease, ListTree, Plus, Trash } from "lucide-react";
import { saveMenuAction } from "@/app/admin/_actions/menus";
import { Card, Empty, SaveBar, TextInput, cx, useEditor } from "@/components/admin/ui";
import { LinkPicker } from "@/components/admin/content/LinkPicker";
import { urlProblem, parseLink } from "@/components/admin/content/links";
import type { LinkTargets, MenuInfo, MenuItemForm } from "@/components/admin/content/types";

type Node = Omit<MenuItemForm, "items"> & { uid: string; items: Node[] };

function withUids(items: MenuItemForm[], prefix = "i"): Node[] {
  return items.map((it, i) => ({ ...it, uid: `${prefix}${i}`, items: withUids(it.items, `${prefix}${i}.`) }));
}
function strip(items: Node[]): MenuItemForm[] {
  return items.map(({ title, ro, url, orig, items: sub }) => ({ title, ro, url, orig, items: strip(sub) }));
}
/** Levels of an item including its sub-items (1 = no sub-items). */
function height(n: Node): number {
  return 1 + (n.items.length ? Math.max(...n.items.map(height)) : 0);
}
function countAll(items: Node[]): number {
  return items.reduce((s, n) => s + 1 + countAll(n.items), 0);
}
/** The sibling list holding the item at `path`. */
function siblings(tree: Node[], path: number[]): Node[] {
  let list = tree;
  for (const i of path.slice(0, -1)) list = list[i].items;
  return list;
}
function invalidItems(items: Node[], targets: LinkTargets): number {
  return items.reduce((s, n) => s + (!n.title.trim() || !!urlProblem(n.url) || linkMissing(n.url, targets) ? 1 : 0) + invalidItems(n.items, targets), 0);
}
function linkMissing(url: string, t: LinkTargets): boolean {
  const { kind, key } = parseLink(url);
  if (!key) return false;
  const has = (list: { handle: string }[]) => list.some((x) => x.handle === key);
  if (kind === "collection") return key !== "all" && !has(t.collections);
  if (kind === "product") return !has(t.products);
  if (kind === "page") return !has(t.pages);
  if (kind === "blog") return !has(t.blogs);
  if (kind === "article") return !t.articles.some((a) => `${a.blog}/${a.handle}` === key);
  return false;
}

let seq = 0;
const newNode = (): Node => ({ uid: `n${Date.now()}-${seq++}`, title: "", ro: "", url: "", orig: null, items: [] });

function OneMenu({ menu, targets, hidden, onDirty }: { menu: MenuInfo; targets: LinkTargets; hidden: boolean; onDirty: (handle: string, dirty: boolean) => void }) {
  const [showErrors, setShowErrors] = useState(false);
  // a newly added item gets the cursor in its title
  const [focusUid, setFocusUid] = useState<string | null>(null);
  const ed = useEditor<Node[]>(withUids(menu.items), async (items) => {
    if (invalidItems(items, targets)) {
      setShowErrors(true);
      return { error: "Попълнете заглавие и изберете накъде води всяка връзка (отбелязаните в червено)." };
    }
    setShowErrors(false);
    return saveMenuAction(menu.handle, strip(items));
  });
  const tree = ed.value;
  const change = (fn: (draft: Node[]) => void) =>
    ed.setValue((cur) => {
      const draft = structuredClone(cur);
      fn(draft);
      return draft;
    });
  const total = countAll(tree);
  const dirty = ed.dirty;
  useEffect(() => onDirty(menu.handle, dirty), [onDirty, menu.handle, dirty]);

  // a render function, not a component: the rows must keep their inputs (and focus) while typing
  const renderItem = (node: Node, path: number[]): React.ReactNode => {
    const depth = path.length;
    const i = path[path.length - 1];
    const sibs = siblings(tree, path);
    const name = node.title.trim() ? `„${node.title.trim()}“` : "връзката";
    const canIndent = i > 0 && depth + height(node) <= menu.maxDepth;
    const canAddChild = depth < menu.maxDepth;
    const titleBad = showErrors && !node.title.trim();
    const btn = "grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";
    return (
      <li key={node.uid}>
        <div className="rounded-2xl border border-line bg-white p-3 md:p-4">
          <div className="mb-2 flex flex-wrap items-center gap-1">
            <span className="mr-auto text-xs font-black uppercase tracking-wide text-muted">{depth === 1 ? `Връзка ${path.map((x) => x + 1).join(".")}` : `Подменю ${path.map((x) => x + 1).join(".")}`}</span>
            <button type="button" className={btn} disabled={i === 0} title="Нагоре" aria-label={`Премести ${name} нагоре`} onClick={() => change((d) => { const s = siblings(d, path); [s[i - 1], s[i]] = [s[i], s[i - 1]]; })}>
              <ArrowUp className="h-4 w-4" />
            </button>
            <button type="button" className={btn} disabled={i === sibs.length - 1} title="Надолу" aria-label={`Премести ${name} надолу`} onClick={() => change((d) => { const s = siblings(d, path); [s[i + 1], s[i]] = [s[i], s[i + 1]]; })}>
              <ArrowDown className="h-4 w-4" />
            </button>
            {menu.maxDepth > 1 ? (
              <>
                <button
                  type="button"
                  className={btn}
                  disabled={!canIndent}
                  title="Направи подменю на връзката отгоре"
                  aria-label={`Направи ${name} подменю на връзката отгоре`}
                  onClick={() =>
                    change((d) => {
                      const s = siblings(d, path);
                      const [moved] = s.splice(i, 1);
                      s[i - 1].items.push(moved);
                    })
                  }
                >
                  <ListIndentIncrease className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className={btn}
                  disabled={depth === 1}
                  title="Извади от подменюто (едно ниво нагоре)"
                  aria-label={`Извади ${name} от подменюто`}
                  onClick={() =>
                    change((d) => {
                      const s = siblings(d, path);
                      const [moved] = s.splice(i, 1);
                      const parentPath = path.slice(0, -1);
                      siblings(d, parentPath).splice(parentPath[parentPath.length - 1] + 1, 0, moved);
                    })
                  }
                >
                  <ListIndentDecrease className="h-4 w-4" />
                </button>
              </>
            ) : null}
            <button
              type="button"
              className={cx(btn, "hover:!text-brand")}
              title="Премахни"
              aria-label={`Премахни ${name}`}
              onClick={() => {
                if (node.items.length && !window.confirm(`Да премахна ли ${name} заедно с подменютата ѝ (${countAll(node.items)})?`)) return;
                change((d) => {
                  siblings(d, path).splice(i, 1);
                });
              }}
            >
              <Trash className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-extrabold">Заглавие (БГ)</span>
              <TextInput
                value={node.title}
                maxLength={120}
                invalid={titleBad}
                autoFocus={focusUid === node.uid}
                onChange={(e) => {
                  const title = e.target.value;
                  change((d) => {
                    siblings(d, path)[i].title = title;
                  });
                }}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-extrabold">Заглавие (RO)</span>
              <TextInput
                value={node.ro}
                maxLength={120}
                placeholder={node.title || "по желание"}
                onChange={(e) => {
                  const ro = e.target.value;
                  change((d) => {
                    siblings(d, path)[i].ro = ro;
                  });
                }}
              />
            </label>
            <div className="md:col-span-2">
              <span className="mb-1 block text-sm font-extrabold">Води към</span>
              <LinkPicker
                value={node.url}
                label={`Връзка ${path.map((x) => x + 1).join(".")}`}
                targets={targets}
                showErrors={showErrors}
                onChange={(url) =>
                  change((d) => {
                    siblings(d, path)[i].url = url;
                  })
                }
              />
            </div>
          </div>
          {canAddChild ? (
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-sky hover:underline"
              onClick={() => {
                const n = newNode();
                setFocusUid(n.uid);
                change((d) => {
                  siblings(d, path)[i].items.push(n);
                });
              }}
            >
              <Plus className="h-4 w-4" /> Добави подменю
            </button>
          ) : null}
        </div>
        {node.items.length ? (
          <ul className="ml-4 mt-2 space-y-2 border-l-2 border-line pl-3 md:ml-8 md:pl-5">
            {node.items.map((c, ci) => renderItem(c, [...path, ci]))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <div hidden={hidden}>
      <Card
        title={menu.label}
        description={menu.description}
        actions={
          <a href="/bg-bg" target="_blank" rel="noopener" className="btn btn-ghost h-10 px-4 text-sm">
            <ExternalLink className="h-4 w-4" /> Виж в сайта
          </a>
        }
      >
        {tree.length ? (
          <ul className="space-y-2">
            {tree.map((n, i) => renderItem(n, [i]))}
          </ul>
        ) : (
          <Empty icon={<ListTree className="h-8 w-8" />} title="Менюто е празно">
            Добавете първата връзка с бутона по-долу.
          </Empty>
        )}
        <button
          type="button"
          className="btn btn-ghost mt-4 h-11 px-5"
          onClick={() => {
            const n = newNode();
            setFocusUid(n.uid);
            change((d) => {
              d.push(n);
            });
          }}
        >
          <Plus className="h-4 w-4" /> Добави връзка
        </button>
        <p className="mt-3 text-sm text-muted">
          {total} {total === 1 ? "връзка" : "връзки"}. Промените се виждат в сайта след „Запази промените“.
        </p>
      </Card>
      {!hidden ? <SaveBar dirty={ed.dirty} pending={ed.pending} status={ed.status} onSave={ed.submit} onReset={ed.reset} /> : null}
    </div>
  );
}

export function MenuEditor({ menus, targets, initial }: { menus: MenuInfo[]; targets: LinkTargets; initial: string }) {
  const [current, setCurrent] = useState(menus.some((m) => m.handle === initial) ? initial : (menus[0]?.handle ?? ""));
  const [unsaved, setUnsaved] = useState<string[]>([]);
  const onDirty = useCallback((handle: string, dirty: boolean) => setUnsaved((cur) => (dirty === cur.includes(handle) ? cur : dirty ? [...cur, handle] : cur.filter((h) => h !== handle))), []);
  if (!menus.length) {
    return (
      <Empty icon={<ListTree className="h-8 w-8" />} title="Няма менюта">
        Менютата се създават при вноса от Shopify.
      </Empty>
    );
  }
  return (
    <>
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Кое меню да редактирате">
        {menus.map((m) => (
          <button
            key={m.handle}
            type="button"
            aria-pressed={current === m.handle}
            onClick={() => {
              setCurrent(m.handle);
              window.history.replaceState(null, "", `?menu=${encodeURIComponent(m.handle)}`);
            }}
            className="chip"
          >
            {m.label}
            {unsaved.includes(m.handle) ? <span className="h-2 w-2 rounded-full bg-sun" title="Незапазени промени" aria-label="незапазени промени" /> : null}
          </button>
        ))}
      </div>
      {menus.map((m) => (
        <OneMenu key={m.handle} menu={m} targets={targets} hidden={current !== m.handle} onDirty={onDirty} />
      ))}
    </>
  );
}
