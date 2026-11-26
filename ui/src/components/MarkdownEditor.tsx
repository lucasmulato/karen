import React from 'react';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import '@uiw/react-markdown-preview/markdown.css';

interface Props {
  value: string;
  onChange: (value?: string) => void;
}

/** Loaded only when the user switches a note to Editar. */
const MarkdownEditor: React.FC<Props> = ({ value, onChange }) => (
  <MDEditor
    value={value}
    onChange={onChange}
    height="100%"
    visibleDragbar={false}
    textareaProps={{ spellCheck: false }}
  />
);

export default MarkdownEditor;
