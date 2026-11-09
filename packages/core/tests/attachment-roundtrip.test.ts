import { describe, expect, it } from 'vitest';
import { mount } from './utils';

describe.each(['card', 'link'] as const)('%s attachment Markdown', (display) => {
  it.each([
    ['report[final].pdf', '/files/a.pdf'],
    ['report.pdf', '/files/a(1).pdf'],
    ['my report.pdf', '/files/my report.pdf'],
    ['a\\b.pdf', '/files/a%20b.pdf'],
    ['报告 "最终".pdf', '/files/报告.pdf?x=1&y=2'],
    ['literal *bold* _x_ <tag> &amp;.pdf', '/files/a.pdf'],
    ['a\\[b].pdf', '/files/(nested(1)).pdf'],
    ['a.pdf', '/files/a\\b.pdf'],
  ])('preserves %s at %s', async (name, src) => {
    const editor = await mount({ content: '<p>before after</p>' });
    editor.editor.commands.setTextSelection(8);
    editor.insertAttachment({ name, src, display, size: 1024 });
    const first = editor.getMarkdown();
    for (let round = 0; round < 2; round++) {
      editor.setMarkdown(editor.getMarkdown());
      let found = false;
      editor.editor.state.doc.descendants((node) => {
        if (node.type.name === (display === 'card' ? 'attachment' : 'attachmentLink')) {
          found = true;
          expect(node.attrs).toMatchObject({ name, src, size: 1024 });
        }
      });
      expect(found).toBe(true);
      expect(editor.getMarkdown()).toBe(first);
    }
  });
});

it('parses many attachments on one line without recursively expanding the remaining input', async () => {
  const editor = await mount();
  const markdown = Array.from(
    { length: 40 },
    (_, index) => `!filelink[file ${index}](/files/${index}.pdf)`
  ).join(' ');
  editor.setMarkdown(markdown);
  let count = 0;
  editor.editor.state.doc.descendants((node) => {
    if (node.type.name === 'attachmentLink') count++;
  });
  expect(count).toBe(40);
  expect(editor.getMarkdown()).toBe(markdown);
});
