import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  CONTENT_PATH_PREFIX,
  emptyItem,
  nextId,
  type CollectionDef,
  type FieldDef,
} from "./schema";
import { getFile, putFile } from "./github";

type Item = Record<string, any>;

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: any;
  onChange: (v: any) => void;
}) {
  if (field.type === "boolean") {
    return (
      <div className="flex items-center gap-3">
        <Switch
          checked={!!value}
          onCheckedChange={onChange}
          disabled={field.readOnly}
          data-testid={`switch-${field.name}`}
        />
        <span className="text-sm text-muted-foreground">
          {value ? "Yes" : "No"}
        </span>
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <Textarea
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        readOnly={field.readOnly}
        rows={4}
        placeholder={field.placeholder}
        data-testid={`textarea-${field.name}`}
      />
    );
  }

  if (field.type === "select") {
    return (
      <Select
        value={value ?? ""}
        onValueChange={onChange}
        disabled={field.readOnly}
      >
        <SelectTrigger data-testid={`select-${field.name}`}>
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
          {(field.options ?? []).map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (field.type === "string-list") {
    const list: string[] = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-2">
        {list.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={entry}
              onChange={(e) => {
                const copy = [...list];
                copy[i] = e.target.value;
                onChange(copy);
              }}
              data-testid={`input-${field.name}-${i}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(list.filter((_, j) => j !== i))}
              aria-label="Remove"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg"
          onClick={() => onChange([...list, ""])}
          data-testid={`button-add-${field.name}`}
        >
          <Plus className="mr-1 h-4 w-4" /> Add bullet
        </Button>
      </div>
    );
  }

  return (
    <Input
      type={field.type === "number" ? "number" : "text"}
      value={value ?? ""}
      onChange={(e) =>
        onChange(
          field.type === "number"
            ? e.target.value === ""
              ? 0
              : Number(e.target.value)
            : e.target.value,
        )
      }
      readOnly={field.readOnly}
      placeholder={field.placeholder}
      data-testid={`input-${field.name}`}
    />
  );
}

function ItemDialog({
  open,
  collection,
  draft,
  onClose,
  onSave,
}: {
  open: boolean;
  collection: CollectionDef;
  draft: Item | null;
  onClose: () => void;
  onSave: (item: Item) => void;
}) {
  const [local, setLocal] = useState<Item>({});

  useEffect(() => {
    if (draft) setLocal({ ...draft });
  }, [draft]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            Edit {collection.label.replace(/s$/, "")}
          </DialogTitle>
          <DialogDescription>
            Changes are saved when you publish the section.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {collection.fields.map((field) => (
            <div key={field.name} className="space-y-1.5">
              <Label className="text-sm font-medium">{field.label}</Label>
              <FieldInput
                field={field}
                value={local[field.name]}
                onChange={(v) =>
                  setLocal((prev) => ({ ...prev, [field.name]: v }))
                }
              />
              {field.hint && (
                <p className="text-xs text-muted-foreground">{field.hint}</p>
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              const cleaned = { ...local };
              for (const f of collection.fields) {
                if (
                  f.name === "photoUrl" &&
                  (cleaned[f.name] === "" || cleaned[f.name] == null)
                ) {
                  cleaned[f.name] = null;
                }
              }
              onSave(cleaned);
            }}
            data-testid="button-dialog-save"
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SectionEditor({
  collection,
  token,
  demo,
  demoData,
  onDirtyChange,
}: {
  collection: CollectionDef;
  token: string | null;
  demo: boolean;
  demoData?: Item[];
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [sha, setSha] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<Item | null>(null);

  const path = CONTENT_PATH_PREFIX + collection.fileName;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDirty(false);

    if (demo) {
      setItems((demoData ?? []).map((i) => ({ ...i })));
      setSha(null);
      setLoading(false);
      return;
    }
    if (!token) return;

    getFile(token, path)
      .then((file) => {
        if (cancelled) return;
        const list = Array.isArray(file.json?.items) ? file.json.items : [];
        setItems(list);
        setSha(file.sha);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Failed to load content.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection.key, token, demo]);

  function openAdd() {
    const fresh = emptyItem(collection);
    fresh[collection.idField] = nextId(items, collection.idField);
    if (collection.hasSortOrder) fresh.sortOrder = items.length + 1;
    setDraft(fresh);
    setEditIndex(-1);
  }

  function openEdit(index: number) {
    setDraft({ ...items[index] });
    setEditIndex(index);
  }

  function saveDraft(item: Item) {
    setItems((prev) => {
      if (editIndex === -1) return [...prev, item];
      const copy = [...prev];
      if (editIndex != null) copy[editIndex] = item;
      return copy;
    });
    setDirty(true);
    setEditIndex(null);
    setDraft(null);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    setItems((prev) => {
      const copy = [...prev];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
    setDirty(true);
  }

  async function publish() {
    if (demo || !token || sha == null) return;
    setSaving(true);
    setError(null);
    try {
      const out = collection.hasSortOrder
        ? items.map((it, i) => ({ ...it, sortOrder: i + 1 }))
        : items;
      const newSha = await putFile(
        token,
        path,
        { items: out },
        sha,
        `admin: update ${collection.label.toLowerCase()}`,
      );
      setItems(out);
      setSha(newSha);
      setDirty(false);
      toast({
        title: "Published",
        description: `${collection.label} saved. The live site updates in ~90 seconds.`,
      });
    } catch (e: any) {
      setError(e?.message || "Publish failed.");
      toast({
        title: "Publish failed",
        description: e?.message || "Something went wrong.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            {collection.label}
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            {collection.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {collection.allowAdd && (
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={openAdd}
              disabled={loading || !!error || demo}
              title={demo ? "Sign in to add items" : undefined}
              data-testid="button-add-item"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add
            </Button>
          )}
          <Button
            className="rounded-xl font-semibold"
            onClick={publish}
            disabled={!dirty || saving || demo}
            data-testid="button-publish"
          >
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            {demo ? "Demo — publish disabled" : dirty ? "Publish changes" : "Saved"}
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-3">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No items yet.
            </p>
          )}
          {items.map((item, index) => (
            <div
              key={item[collection.idField] ?? index}
              className="group flex items-center gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3 hover:border-border transition-colors"
              data-testid={`row-item-${index}`}
            >
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0 || demo}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  aria-label="Move up"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1 || demo}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  aria-label="Move down"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  {collection.summary(item)}
                </p>
                {item.quote && (
                  <p className="text-xs text-muted-foreground truncate">
                    {String(item.quote)}
                  </p>
                )}
                {item.value && (
                  <p className="text-xs text-muted-foreground truncate">
                    {String(item.value)}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(index)}
                  disabled={demo}
                  aria-label="Edit"
                  data-testid={`button-edit-${index}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                {collection.allowDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(index)}
                    disabled={demo}
                    aria-label="Delete"
                    className="text-muted-foreground hover:text-destructive"
                    data-testid={`button-delete-${index}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ItemDialog
        open={editIndex !== null}
        collection={collection}
        draft={draft}
        onClose={() => {
          setEditIndex(null);
          setDraft(null);
        }}
        onSave={saveDraft}
      />
    </div>
  );
}
