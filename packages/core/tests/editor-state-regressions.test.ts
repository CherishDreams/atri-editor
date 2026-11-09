import { describe, expect, it } from 'vitest';
import { buttonOf, click, mount, rootOf, toolbarButtons } from './utils';

describe('editor state preservation', () => {
  it('supports inline NodeViews during construction and registration', async () => {
    const config = {
      name: 'mention',
      inline: true,
      attributes: { id: { default: 'u1' } },
      nodeView: () => ({ dom: document.createElement('span') }),
    };
    const editor = await mount({ nodeViews: [config], content: '<p>hello</p>' });
    expect(editor.editor.schema.nodes.mention.isInline).toBe(true);
    editor.editor.commands.insertContent({ type: 'mention', attrs: { id: 'u2' } });
    editor.registerNodeView({ ...config, name: 'anotherMention' });
    expect(editor.editor.schema.nodes.anotherMention.isInline).toBe(true);
    expect(JSON.stringify(editor.getJSON())).toContain('u2');
  });

  it('preserves non-rendered attributes and current editable state on rebuild', async () => {
    const editor = await mount({
      nodeViews: [
        {
          name: 'customCard',
          attributes: { secret: { default: null, renderHTML: () => ({}) } },
          nodeView: () => ({ dom: document.createElement('div') }),
        },
      ],
    });
    editor.editor.commands.insertContent({ type: 'customCard', attrs: { secret: 'keep-me' } });
    expect(editor.getHTML()).not.toContain('keep-me');
    editor.setEditable(false);
    editor.registerNodeViews([]);
    expect(editor.isEditable()).toBe(false);
    expect(JSON.stringify(editor.getJSON())).toContain('keep-me');
  });
});

describe('readonly toolbar', () => {
  it('disables all editing commands initially and after state changes', async () => {
    const editor = await mount({ editable: false, content: '<p>alpha</p>', toolbar: {} });
    editor.editor.commands.setTextSelection({ from: 1, to: 6 });
    expect(toolbarButtons(editor).every((button) => button.disabled)).toBe(true);
    const before = editor.getHTML();
    click(buttonOf(editor, 'bold'));
    expect(editor.getHTML()).toBe(before);
    editor.setEditable(true);
    expect(buttonOf(editor, 'bold').disabled).toBe(false);
    editor.setEditable(false);
    expect(toolbarButtons(editor).every((button) => button.disabled)).toBe(true);
  });

  it.each([
    ['insertImage', '.atri-media-panel', '.atri-media-panel-insert'],
    ['insertTable', '.atri-table-panel', '.atri-table-panel-cell'],
    ['textColor', '.atri-style-panel', '.atri-style-panel-row'],
    ['heading', '.atri-toolbar-menu', '.atri-toolbar-menu-item'],
    ['insertLink', '.atri-link-panel', '.atri-link-panel-apply'],
  ])(
    'closes %s and guards already detached controls',
    async (id, panelSelector, controlSelector) => {
      const editor = await mount({ content: '<p>alpha</p>', toolbar: {} });
      click(buttonOf(editor, id));
      const panel = document.querySelector(panelSelector)!;
      expect(panel).not.toBeNull();
      const input = panel.querySelector<HTMLInputElement>('input[type=url]');
      if (input) input.value = '/image.png';
      const control = panel.querySelector<HTMLElement>(controlSelector)!;
      editor.setEditable(false);
      const before = editor.getHTML();
      expect(document.querySelector(panelSelector)).toBeNull();
      click(control);
      expect(editor.getHTML()).toBe(before);
      expect(rootOf(editor).querySelector('[contenteditable=true]')).toBeNull();
    }
  );

  it('closes link editing with no toolbar', async () => {
    const editor = await mount({ content: '<p><a href="/a">alpha</a></p>' });
    editor.editor.commands.setTextSelection(2);
    click(editor.editor.view.dom.querySelector('a')!);
    expect(document.querySelector('.atri-link-panel')).not.toBeNull();
    editor.setEditable(false);
    expect(document.querySelector('.atri-link-panel')).toBeNull();
  });
});
