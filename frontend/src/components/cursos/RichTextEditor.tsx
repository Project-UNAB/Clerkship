import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered,
  Heading2, Heading3, Quote, Link as LinkIcon, Undo2, Redo2,
  AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react';

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

/** Editor de texto enriquecido para las notas de un bloque de curso. El HTML
 * que produce se vuelve a sanitizar en el backend antes de guardarse (nunca
 * se confía en el HTML tal cual llega del cliente) y de nuevo al mostrarlo
 * (ver ContenidoPreviewModal), como defensa en profundidad contra XSS. */
export default function RichTextEditor({ content, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: placeholder || 'Escribe aquí...' }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: 'ccv-rte-content' },
    },
  });

  if (!editor) return null;

  function setLink() {
    const previa = editor!.getAttributes('link').href as string | undefined;
    const url = window.prompt('URL del enlace', previa || 'https://');
    if (url === null) return;
    if (url === '') {
      editor!.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor!.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }

  return (
    <div className="ccv-rte-wrap">
      <div className="ccv-rte-toolbar">
        <button type="button" className={editor.isActive('bold') ? 'is-active' : ''} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrita">
          <Bold size={14} />
        </button>
        <button type="button" className={editor.isActive('italic') ? 'is-active' : ''} onClick={() => editor.chain().focus().toggleItalic().run()} title="Cursiva">
          <Italic size={14} />
        </button>
        <button type="button" className={editor.isActive('underline') ? 'is-active' : ''} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Subrayado">
          <UnderlineIcon size={14} />
        </button>
        <span className="ccv-rte-divider" />
        <button type="button" className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Título">
          <Heading2 size={14} />
        </button>
        <button type="button" className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Subtítulo">
          <Heading3 size={14} />
        </button>
        <span className="ccv-rte-divider" />
        <button type="button" className={editor.isActive('bulletList') ? 'is-active' : ''} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista">
          <List size={14} />
        </button>
        <button type="button" className={editor.isActive('orderedList') ? 'is-active' : ''} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada">
          <ListOrdered size={14} />
        </button>
        <button type="button" className={editor.isActive('blockquote') ? 'is-active' : ''} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Cita">
          <Quote size={14} />
        </button>
        <button type="button" className={editor.isActive('link') ? 'is-active' : ''} onClick={setLink} title="Enlace">
          <LinkIcon size={14} />
        </button>
        <span className="ccv-rte-divider" />
        <button type="button" className={editor.isActive({ textAlign: 'left' }) ? 'is-active' : ''} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Alinear izquierda">
          <AlignLeft size={14} />
        </button>
        <button type="button" className={editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Centrar">
          <AlignCenter size={14} />
        </button>
        <button type="button" className={editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Alinear derecha">
          <AlignRight size={14} />
        </button>
        <span className="ccv-rte-divider" />
        <button type="button" onClick={() => editor.chain().focus().undo().run()} title="Deshacer">
          <Undo2 size={14} />
        </button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} title="Rehacer">
          <Redo2 size={14} />
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
