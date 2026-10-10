import { Node, mergeAttributes } from '@tiptap/core'

const mediaUrlPattern = /^\/api\/media\/[0-9a-f-]{36}$/

export const Video = Node.create({
  name: 'video',

  group: 'block',

  atom: true,

  markdownTokenName: 'uploadedVideo',

  markdownTokenizer: {
    name: 'uploadedVideo',
    level: 'block',
    start: source => source.indexOf('<video '),
    tokenize: (source) => {
      const match = /^<video\s+src="(\/api\/media\/[0-9a-f-]{36})"\s+controls><\/video>(?:\r?\n)?/.exec(source)
      return match
        ? { type: 'uploadedVideo', raw: match[0], src: match[1] }
        : undefined
    }
  },

  addAttributes() {
    return {
      src: {
        default: null
      }
    }
  },

  parseHTML() {
    return [{
      tag: 'video[src]',
      getAttrs: (element) => {
        const src = (element as HTMLElement).getAttribute('src')
        return src && mediaUrlPattern.test(src) ? null : false
      }
    }]
  },

  parseMarkdown(token, helpers) {
    const src = typeof token.src === 'string' && mediaUrlPattern.test(token.src)
      ? token.src
      : null
    return src ? helpers.createNode('video', { src }) : []
  },

  renderHTML({ HTMLAttributes }) {
    return ['video', mergeAttributes(HTMLAttributes, {
      controls: true,
      preload: 'metadata'
    })]
  },

  renderMarkdown(node) {
    const src = typeof node.attrs?.src === 'string' && mediaUrlPattern.test(node.attrs.src)
      ? node.attrs.src
      : ''
    return `<video src="${src}" controls></video>\n`
  }
})
