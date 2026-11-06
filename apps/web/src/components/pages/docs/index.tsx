import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  LockKeyhole,
  Search
} from 'lucide-react';
import PageHeader from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getGpsGuide } from '@/lib/api/documentation';
import { cn } from '@/lib/utils';
import GuideBlock from './guide-block';

export default function DocsPage() {
  const guide = useQuery({
    queryKey: ['documentation', 'gps'],
    queryFn: getGpsGuide,
    retry: false,
    staleTime: 5 * 60 * 1000
  });
  const [search, setSearch] = useState('');
  const [chapter, setChapter] = useState(
    () => window.location.hash.slice(1) || 'start'
  );
  useEffect(() => {
    const update = () => setChapter(window.location.hash.slice(1) || 'start');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  const sections = guide.data?.sections ?? [];
  const query = search.trim().toLocaleLowerCase();
  const filtered = sections.filter((section) =>
    JSON.stringify(section).toLocaleLowerCase().includes(query)
  );
  const selected =
    filtered.find((section) => section.id === chapter) ?? filtered[0];
  const index = selected ? filtered.indexOf(selected) : -1;
  const select = (id: string) => {
    setChapter(id);
    window.location.hash = id;
  };

  return (
    <div>
      <PageHeader
        title="Docs"
        description="Practical guides for setting up and using MMS."
        action={
          <span className="text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs">
            <LockKeyhole className="size-3.5" />
            Admin access
          </span>
        }
      />
      {guide.isPending ? (
        <Card className="text-muted-foreground p-8 text-sm" role="status">
          Loading the GPS guide…
        </Card>
      ) : guide.isError ? (
        <Card role="alert" className="items-start p-6">
          <p className="font-medium">The guide could not be loaded.</p>
          <p className="text-muted-foreground text-sm">
            Check your connection, then try again.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void guide.refetch()}
          >
            Try again
          </Button>
        </Card>
      ) : (
        guide.data && (
          <div className="grid min-w-0 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
            <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
              <div className="mb-4 flex items-center gap-2.5">
                <BookOpen className="text-signal size-4" />
                <div>
                  <p className="text-sm font-semibold">GPS tracking</p>
                  <p className="text-muted-foreground text-xs">
                    Setup & everyday use
                  </p>
                </div>
              </div>
              <div className="relative mb-4">
                <Search
                  className="text-muted-foreground absolute top-2.5 left-3 size-4"
                  aria-hidden="true"
                />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  aria-label="Search this guide"
                  placeholder="Search this guide…"
                  className="pl-9"
                />
              </div>
              {search && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearch('')}
                  className="mb-3"
                >
                  Clear search
                </Button>
              )}
              <nav
                aria-label="Guide chapters"
                className="hidden space-y-1 lg:block"
              >
              {filtered.map((section) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    aria-label={section.title}
                    aria-current={
                      selected?.id === section.id ? 'page' : undefined
                    }
                    onClick={() => setChapter(section.id)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm leading-5 transition-colors',
                      selected?.id === section.id
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <span className="text-muted-foreground w-4 shrink-0 text-xs tabular-nums">
                    {sections.indexOf(section) + 1}
                    </span>
                    {section.title}
                  </a>
                ))}
              </nav>
              {filtered.length > 0 && (
                <div className="lg:hidden">
                  <label
                    htmlFor="guide-chapter"
                    className="text-muted-foreground mb-1.5 block text-xs"
                  >
                    Choose a chapter
                  </label>
                  <select
                    id="guide-chapter"
                    aria-label="Guide chapter"
                    value={selected?.id}
                    onChange={(event) => select(event.target.value)}
                    className="bg-background border-input focus-visible:ring-ring h-11 w-full min-w-0 rounded-lg border px-3 text-sm focus-visible:ring-2"
                  >
                    {filtered.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="text-muted-foreground mt-5 hidden text-xs leading-5 lg:block">
                Connection details verified
                <br />
                {guide.data.verifiedOn}.<br />
                Check current server settings before adding a new batch.
              </p>
            </aside>
            <Card className="min-w-0 gap-0 overflow-hidden py-0">
              {selected ? (
                <>
                  <div className="border-b px-5 py-5 sm:px-8 sm:py-6">
                    <p className="text-muted-foreground mb-2 text-xs">
                      GPS guide <span aria-hidden="true">/</span> Chapter{' '}
                      {sections.indexOf(selected) + 1} of {sections.length}
                    </p>
                    <h2
                      id={selected.id}
                      className="scroll-mt-24 text-xl font-semibold tracking-tight"
                    >
                      {selected.title}
                    </h2>
                    <p className="text-muted-foreground mt-2 text-sm leading-6">
                      {selected.summary}
                    </p>
                  </div>
                  <article
                    aria-label={selected.title}
                    className="min-w-0 space-y-6 px-5 py-6 sm:px-8 sm:py-8"
                  >
                    {selected.blocks.map((block, blockIndex) => (
                      <GuideBlock
                        key={`${selected.id}-${blockIndex}`}
                        block={block}
                      />
                    ))}
                  </article>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4 sm:px-8">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={index <= 0}
                      onClick={() => select(filtered[index - 1].id)}
                    >
                      <ChevronLeft className="size-4" />
                      Previous chapter
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={index >= filtered.length - 1}
                      onClick={() => select(filtered[index + 1].id)}
                    >
                      Next chapter
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="p-8">
                  <h2 className="font-semibold">No chapters found</h2>
                  <p className="text-muted-foreground mt-2 text-sm">
                    Try a shorter search, such as SIM, offline, or Cloud Shell.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setSearch('')}
                  >
                    Show all chapters
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )
      )}
    </div>
  );
}
