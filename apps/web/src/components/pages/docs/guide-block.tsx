import type { GuideBlock as GuideBlockContent } from '@mms/shared';
import { ArrowUpRight, Check, Copy, Info, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function GuideBlock({ block }: { block: GuideBlockContent }) {
  switch (block.kind) {
    case 'text':
      return (
        <p className="text-muted-foreground text-sm leading-7">{block.text}</p>
      );
    case 'callout': {
      const Icon =
        block.tone === 'warning'
          ? TriangleAlert
          : block.tone === 'success'
            ? Check
            : Info;
      return (
        <aside
          className={cn(
            'flex gap-3 rounded-xl border p-4',
            block.tone === 'warning'
              ? 'bg-status-wait-bg/40'
              : block.tone === 'success'
                ? 'bg-status-done-bg/40'
                : 'bg-status-move-bg/30'
          )}
        >
          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">{block.title}</p>
            <p className="text-muted-foreground mt-1 text-sm leading-6">
              {block.text}
            </p>
          </div>
        </aside>
      );
    }
    case 'checklist':
      return (
        <ul className="space-y-3">
          {block.items.map((item, index) => (
            <li
              key={index}
              className="flex items-start gap-3 text-sm leading-6"
            >
              <Check
                className="text-status-done-fg mt-1 size-4 shrink-0"
                aria-hidden="true"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case 'steps':
      return (
        <ol className="space-y-6">
          {block.items.map((step, index) => (
            <li key={index} className="flex items-start gap-3.5">
              <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {index + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-sm leading-7 font-semibold">
                  {step.title}
                </h3>
                <p className="text-muted-foreground mt-1 text-sm leading-7">
                  {step.text}
                </p>
                {step.expected && (
                  <p className="bg-muted/50 mt-2 rounded-lg px-3 py-2 text-sm leading-6">
                    <span className="font-medium">What you should see: </span>
                    {step.expected}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      );
    case 'code':
      return (
        <div className="min-w-0 overflow-hidden rounded-xl border">
          <div className="bg-muted/40 flex items-center justify-between gap-3 border-b px-4 py-2">
            <p className="min-w-0 text-sm font-medium">{block.label}</p>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Copy ${block.label}`}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(block.code);
                  toast.success('Copied to clipboard');
                } catch {
                  toast.error(
                    'Copy is unavailable. Select the text below and copy it manually.'
                  );
                }
              }}
            >
              <Copy className="size-3.5" />
              Copy
            </Button>
          </div>
          {block.description && (
            <p className="text-muted-foreground px-4 pt-3 text-sm leading-6">
              {block.description}
            </p>
          )}
          <pre
            className="max-w-full overflow-x-auto p-4 text-[13px] leading-6"
            tabIndex={0}
          >
            <code>{block.code}</code>
          </pre>
        </div>
      );
    case 'table':
      return (
        <div className="max-w-full overflow-x-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40">
              <tr>
                {block.headings.map((heading, index) => (
                  <th key={index} scope="col" className="px-4 py-3 font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, index) => (
                <tr key={index} className="border-t">
                  {row.map((cell, column) => (
                    <td
                      key={column}
                      className={cn(
                        'px-4 py-3 align-top leading-6 break-words',
                        column === 0 ? 'font-medium' : 'text-muted-foreground'
                      )}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'faq':
      return (
        <div className="divide-y rounded-xl border">
          {block.items.map((item, index) => (
            <details key={index} className="group px-4 py-4">
              <summary className="cursor-pointer text-sm leading-6 font-medium">
                {item.question}
              </summary>
              <p className="text-muted-foreground mt-3 text-sm leading-7">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      );
    case 'link': {
      const external = block.href.startsWith('https://');
      return (
        <a
          href={block.href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer' : undefined}
          className="text-signal inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
        >
          {block.label}
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
      );
    }
  }
}
