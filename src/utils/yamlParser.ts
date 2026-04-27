import * as yaml from 'yaml';

type YamlParseOptions = yaml.ParseOptions &
  yaml.DocumentOptions &
  yaml.SchemaOptions &
  yaml.ToJSOptions;

const CustomTags: yaml.Tags = [
  ...[
    '!uint8_t',
    '!int8_t',
    '!uint16_t',
    '!int16_t',
    '!uint32_t',
    '!int32_t',
    '!float',
  ].map((tag) => ({
    tag,
    identify: (value: unknown) => typeof value === 'number',
    resolve: (str: string) => {
      const num = Number(str);
      const node = new yaml.Scalar(num);
      if (str.toLowerCase().startsWith('0x')) {
        node.format = 'HEX';
        (node as any)._originalSource = str;
        node.toJSON = function () {
          if (
            (this as any)._originalSource &&
            Number((this as any)._originalSource) === this.value
          ) {
            return (this as any)._originalSource;
          }
          return '0x' + this.value.toString(16);
        };
      }
      return node;
    },
    stringify: (item: yaml.Scalar) => {
      if (item.format === 'HEX' && typeof item.value === 'number') {
        if (
          (item as any)._originalSource &&
          Number((item as any)._originalSource) === item.value
        ) {
          return (item as any)._originalSource;
        }
        return '0x' + item.value.toString(16);
      }
      return String(item.value);
    },
  })),
  {
    tag: '!std::string',
    identify: (value: unknown) => typeof value === 'string',
    resolve: (str: string) => String(str),
  },
];

const yamlParseOptions: YamlParseOptions = { customTags: CustomTags };

export function parseYamlWithTags(text: string): unknown {
  return yaml.parse(text, yamlParseOptions);
}

export function parseYamlDocumentWithTags(text: string): yaml.Document {
  return yaml.parseDocument(text, yamlParseOptions);
}

export function stringifyYamlDocumentWithTags(doc: yaml.Document): string {
  let output = doc.toString({ indent: 2, indentSeq: true });

  // Step 1: Collapse ALL blank lines to single newlines
  output = output.replace(/\n\n+/g, '\n');

  // Step 2: Add blank line before "tasks:" (after slave-level fields)
  output = output.replace(/\n( {6}tasks:)/g, '\n\n$1');

  // Step 3: Add blank lines between tasks (skip first after "tasks:")
  output = output.replace(/\n( {8}- app_\d+:)/g, (match, p1, offset) => {
    const prevNewline = output.lastIndexOf('\n', offset - 1);
    const prevLine = output.substring(prevNewline + 1, offset).trimEnd();
    if (prevLine === '      tasks:') return match;
    return '\n\n' + p1;
  });

  // Step 4: Add blank lines between slaves (skip first after "slaves:")
  output = output.replace(/\n( {2}- [a-zA-Z0-9_]+:)/g, (match, p1, offset) => {
    const prevNewline = output.lastIndexOf('\n', offset - 1);
    const prevLine = output.substring(prevNewline + 1, offset).trimEnd();
    if (prevLine === 'slaves:') return match;
    return '\n\n' + p1;
  });

  return output;
}

export function stringifyYamlWithTags(data: unknown): string {
  return yaml.stringify(data, { customTags: CustomTags });
}
