import { Marked, Tokens } from 'marked'

import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs border rounded shadow syntax-highlighter language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'markdown'
      return hljs.highlight(code, { language }).value
    },
  })
)

// Custom renderer to add Tailwind CSS classes
const renderer = new marked.Renderer()

renderer.heading = ({ tokens, depth }) => {
  const tag = `h${depth}`
  let classes = 'font-bold text-gray-800'

  switch (depth) {
    case 1:
      classes += ' text-3xl'
      break
    case 2:
      classes += ' text-2xl'
      break
    case 3:
      classes += ' text-xl'
      break
    case 4:
      classes += ' text-lg'
      break
    case 5:
      classes += ' text-base'
      break
    case 6:
      classes += ' text-base'
      break
    default:
      classes += ' text-base'
      break
  }

  return `<${tag} class="${classes}">${renderer.parser.parseInline(tokens)}</${tag}>`
}

renderer.paragraph = ({ tokens }) => {
  return `<p class="mb-4">${renderer.parser.parseInline(tokens)}</p>`
}

renderer.list = (token: Tokens.List) => {
  const tag = token.ordered ? 'ol' : 'ul'
  const classes = 'list-inside mb-4 ' + (token.ordered ? 'list-decimal' : 'list-disc')
  const body = token.items.map((item: any) => renderer.listitem(item)).join('')
  return `<${tag} class="${classes}">${body}</${tag}>`
}

renderer.listitem = (item: Tokens.ListItem) => {
  let itemBody = ''
  if (item.task) {
    const checkbox = renderer.checkbox({ checked: !!item.checked })
    if (item.loose) {
      if (item.tokens[0]?.type === 'paragraph') {
        item.tokens[0].text = checkbox + ' ' + item.tokens[0].text
        if (
          item.tokens[0].tokens &&
          item.tokens[0].tokens.length > 0 &&
          item.tokens[0].tokens[0].type === 'text'
        ) {
          item.tokens[0].tokens[0].text = checkbox + ' ' + escape(item.tokens[0].tokens[0].text)
          item.tokens[0].tokens[0].escaped = true
        }
      } else {
        item.tokens.unshift({
          type: 'text',
          raw: checkbox + ' ',
          text: checkbox + ' ',
          escaped: true,
        })
      }
    } else {
      itemBody += checkbox + ' '
    }
  }

  itemBody += renderer.parser.parse(item.tokens, !!item.loose)

  return `<li class="mb-2">${itemBody}</li>\n`
}

renderer.table = (token: Tokens.Table) => {
  let header = ''

  // header
  let cell = ''
  for (let j = 0; j < token.header.length; j++) {
    cell += renderer.tablecell(token.header[j])
  }
  header += renderer.tablerow({ text: cell })

  let body = ''
  for (let j = 0; j < token.rows.length; j++) {
    const row = token.rows[j]

    cell = ''
    for (let k = 0; k < row.length; k++) {
      cell += renderer.tablecell(row[k])
    }

    body += renderer.tablerow({ text: cell })
  }
  if (body) body = `<tbody>${body}</tbody>`

  return '<table class="table-auto">\n' + '<thead>\n' + header + '</thead>\n' + body + '</table>\n'
}

renderer.link = ({ href, title, text }: Tokens.Link) => {
  return `<a href="${href}" title="${title}" target="_blank" class="text-blue-500 hover:underline">${text}</a>`
}

const processText = (text: string) => {
  if (!text) {
    return text
  }
  const modifiedText = marked.parse(text, {
    renderer,
    gfm: true,
    breaks: true,
  })
  return modifiedText
}

const MarkdownText = ({ text }: { text: string }) => {
  // the text might be wrapped in ```markdown```
  const markdownText = text.replace(/^```markdown\s*\n/, '').replace(/\n```$/, '')

  return (
    <div
      dangerouslySetInnerHTML={{
        __html: processText(markdownText),
      }}
    />
  )
}

export default MarkdownText
