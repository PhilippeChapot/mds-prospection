'use client';

import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Quote,
  Code,
  Undo2,
  Redo2,
  LinkIcon,
  Palette,
  Variable,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * P8.3-ter — éditeur WYSIWYG TipTap pour le body HTML des campagnes.
 *
 * 2 modes synchronises :
 *   - 'visual' (defaut) : éditeur TipTap riche.
 *   - 'html'            : Textarea HTML brut éditable.
 * Toggle bidirectionnel via une checkbox "HTML" dans la toolbar — le
 * contenu se conserve dans les 2 sens (le passage visual->html serialize
 * via editor.getHTML(), html->visual le re-parse via setContent).
 *
 * Bonus : dropdown "Insérer variable" qui insère {prenom}/{societe}/
 * {etape} au curseur en texte brut (sera substitué a l'envoi).
 */

const TIPTAP_VARIABLES: Array<{ label: string; value: string }> = [
  { label: '{prenom}', value: '{prenom}' },
  { label: '{societe}', value: '{societe}' },
  { label: '{etape}', value: '{etape}' },
];

interface Props {
  value: string;
  onChange: (html: string) => void;
  /** Placeholder affiche quand l'editeur est vide. */
  placeholder?: string;
}

export function CampaignBodyEditor({ value, onChange, placeholder }: Props) {
  const [mode, setMode] = useState<'visual' | 'html'>('visual');
  const [showVariableMenu, setShowVariableMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  // Buffer HTML pour le mode 'html' (synchro a l'application du toggle).
  const [htmlBuffer, setHtmlBuffer] = useState(value);
  const initializedRef = useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({
        placeholder: placeholder ?? 'Bonjour {prenom}, votre message ici...',
      }),
    ],
    content: value,
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML();
      setHtmlBuffer(html);
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm min-h-[300px] max-w-none p-4 focus:outline-none',
          'prose-headings:font-bold prose-p:my-2 prose-a:text-md-blue',
        ),
      },
    },
  });

  // Synchro mode visual : si value externe change (e.g. mode edit P8.3-bis
  // qui prefill), pousser dans l'editeur — mais seulement une fois apres
  // init pour eviter une boucle infinie.
  useEffect(() => {
    if (!editor) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      if (value && value !== editor.getHTML()) {
        editor.commands.setContent(value);
      }
      setHtmlBuffer(value);
    }
  }, [editor, value]);

  function applyHtmlBufferToVisual() {
    if (!editor) return;
    editor.commands.setContent(htmlBuffer || '<p></p>');
    onChange(htmlBuffer);
  }

  function switchMode(next: 'visual' | 'html') {
    if (next === 'html') {
      if (editor) setHtmlBuffer(editor.getHTML());
    } else {
      applyHtmlBufferToVisual();
    }
    setMode(next);
  }

  function insertVariable(variable: string) {
    if (mode === 'visual' && editor) {
      editor.chain().focus().insertContent(variable).run();
    } else {
      const next = `${htmlBuffer}${variable}`;
      setHtmlBuffer(next);
      onChange(next);
    }
    setShowVariableMenu(false);
  }

  function promptLink() {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL du lien :', previousUrl ?? 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  function applyColor(color: string) {
    if (!editor) return;
    editor.chain().focus().setColor(color).run();
    setShowColorPicker(false);
  }

  return (
    <div className="border-md-border space-y-0 rounded-md border bg-white">
      {/* Toolbar */}
      <div className="border-md-border bg-md-bg-soft flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        <ToolbarBtn
          editor={editor}
          isActive={editor?.isActive('bold')}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          label="Gras"
          disabled={mode === 'html'}
        >
          <Bold className="size-4" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn
          editor={editor}
          isActive={editor?.isActive('italic')}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          label="Italique"
          disabled={mode === 'html'}
        >
          <Italic className="size-4" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn
          editor={editor}
          isActive={editor?.isActive('underline')}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          label="Souligné"
          disabled={mode === 'html'}
        >
          <UnderlineIcon className="size-4" aria-hidden />
        </ToolbarBtn>
        <Sep />
        <ToolbarBtn
          editor={editor}
          isActive={editor?.isActive('heading', { level: 1 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          label="Titre 1"
          disabled={mode === 'html'}
        >
          <Heading1 className="size-4" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn
          editor={editor}
          isActive={editor?.isActive('heading', { level: 2 })}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          label="Titre 2"
          disabled={mode === 'html'}
        >
          <Heading2 className="size-4" aria-hidden />
        </ToolbarBtn>
        <Sep />
        <ToolbarBtn
          editor={editor}
          isActive={editor?.isActive('bulletList')}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          label="Liste à puces"
          disabled={mode === 'html'}
        >
          <List className="size-4" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn
          editor={editor}
          isActive={editor?.isActive('orderedList')}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          label="Liste numérotée"
          disabled={mode === 'html'}
        >
          <ListOrdered className="size-4" aria-hidden />
        </ToolbarBtn>
        <Sep />
        <ToolbarBtn
          editor={editor}
          isActive={editor?.isActive({ textAlign: 'left' })}
          onClick={() => editor?.chain().focus().setTextAlign('left').run()}
          label="Aligner à gauche"
          disabled={mode === 'html'}
        >
          <AlignLeft className="size-4" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn
          editor={editor}
          isActive={editor?.isActive({ textAlign: 'center' })}
          onClick={() => editor?.chain().focus().setTextAlign('center').run()}
          label="Centrer"
          disabled={mode === 'html'}
        >
          <AlignCenter className="size-4" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn
          editor={editor}
          isActive={editor?.isActive({ textAlign: 'right' })}
          onClick={() => editor?.chain().focus().setTextAlign('right').run()}
          label="Aligner à droite"
          disabled={mode === 'html'}
        >
          <AlignRight className="size-4" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn
          editor={editor}
          isActive={editor?.isActive({ textAlign: 'justify' })}
          onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
          label="Justifier"
          disabled={mode === 'html'}
        >
          <AlignJustify className="size-4" aria-hidden />
        </ToolbarBtn>
        <Sep />
        <ToolbarBtn
          editor={editor}
          onClick={promptLink}
          isActive={editor?.isActive('link')}
          label="Insérer un lien"
          disabled={mode === 'html'}
        >
          <LinkIcon className="size-4" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn
          editor={editor}
          isActive={editor?.isActive('blockquote')}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          label="Citation"
          disabled={mode === 'html'}
        >
          <Quote className="size-4" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn
          editor={editor}
          isActive={editor?.isActive('code')}
          onClick={() => editor?.chain().focus().toggleCode().run()}
          label="Code inline"
          disabled={mode === 'html'}
        >
          <Code className="size-4" aria-hidden />
        </ToolbarBtn>
        <div className="relative">
          <ToolbarBtn
            editor={editor}
            onClick={() => setShowColorPicker((v) => !v)}
            label="Couleur du texte"
            disabled={mode === 'html'}
          >
            <Palette className="size-4" aria-hidden />
          </ToolbarBtn>
          {showColorPicker ? (
            <div className="border-md-border absolute top-full left-0 z-20 mt-1 flex gap-1 rounded-md border bg-white p-2 shadow-md">
              {['#000000', '#E91E63', '#031A56', '#1FBF7A', '#F5A524', '#666666'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => applyColor(c)}
                  className="border-md-border size-5 rounded-full border"
                  style={{ background: c }}
                  aria-label={`Couleur ${c}`}
                />
              ))}
            </div>
          ) : null}
        </div>
        <Sep />
        <ToolbarBtn
          editor={editor}
          onClick={() => editor?.chain().focus().undo().run()}
          label="Annuler"
          disabled={mode === 'html'}
        >
          <Undo2 className="size-4" aria-hidden />
        </ToolbarBtn>
        <ToolbarBtn
          editor={editor}
          onClick={() => editor?.chain().focus().redo().run()}
          label="Rétablir"
          disabled={mode === 'html'}
        >
          <Redo2 className="size-4" aria-hidden />
        </ToolbarBtn>
        <Sep />
        {/* Variables */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowVariableMenu((v) => !v)}
            className="text-md-text hover:bg-muted inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs"
            title="Insérer une variable"
          >
            <Variable className="size-3.5" aria-hidden />
            Variable
          </button>
          {showVariableMenu ? (
            <div className="border-md-border absolute top-full right-0 z-20 mt-1 w-44 rounded-md border bg-white py-1 text-xs shadow-md">
              {TIPTAP_VARIABLES.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => insertVariable(v.value)}
                  className="hover:bg-muted block w-full px-3 py-1.5 text-left font-mono"
                >
                  {v.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {/* Toggle HTML mode */}
        <label className="text-md-text-muted ml-auto inline-flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={mode === 'html'}
            onChange={(e) => switchMode(e.target.checked ? 'html' : 'visual')}
            className="size-3.5"
          />
          HTML
        </label>
      </div>

      {/* Editor body */}
      {mode === 'visual' ? (
        <EditorContent editor={editor} />
      ) : (
        <Textarea
          value={htmlBuffer}
          onChange={(e) => {
            setHtmlBuffer(e.target.value);
            onChange(e.target.value);
          }}
          rows={12}
          className="rounded-none border-0 font-mono text-xs focus-visible:ring-0"
        />
      )}
    </div>
  );
}

function ToolbarBtn({
  editor,
  isActive,
  onClick,
  label,
  disabled,
  children,
}: {
  editor: Editor | null;
  isActive?: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !editor}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md transition disabled:opacity-40',
        isActive ? 'bg-md-magenta/15 text-md-magenta' : 'text-md-text hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="bg-md-border mx-0.5 h-5 w-px" aria-hidden />;
}
