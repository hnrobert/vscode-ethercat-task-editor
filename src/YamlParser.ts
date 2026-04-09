import * as yaml from 'yaml';

type YamlParseOptions = yaml.ParseOptions &
  yaml.DocumentOptions &
  yaml.SchemaOptions &
  yaml.ToJSOptions;

const CustomTags: yaml.Tags = [
  {
    tag: '!uint8_t',
    resolve: (str: string) => Number(str),
  },
  {
    tag: '!int8_t',
    resolve: (str: string) => Number(str),
  },
  {
    tag: '!uint16_t',
    resolve: (str: string) => Number(str),
  },
  {
    tag: '!int16_t',
    resolve: (str: string) => Number(str),
  },
  {
    tag: '!uint32_t',
    resolve: (str: string) => Number(str),
  },
  {
    tag: '!int32_t',
    resolve: (str: string) => Number(str),
  },
  {
    tag: '!float',
    resolve: (str: string) => Number(str),
  },
  {
    tag: '!std::string',
    resolve: (str: string) => String(str),
  },
];

const yamlParseOptions: YamlParseOptions = { customTags: CustomTags };

export function parseYamlWithTags(text: string) {
  return yaml.parse(text, yamlParseOptions);
}

export function stringifyYamlWithTags(data: unknown) {
  // Basic conversion logic requires manually traversing the AST and stringifying.
  // For now we will stringify it and re-add standard tags where appropriate via JSON structure. Wait for explicit definition of stringify.
  return yaml.stringify(data);
}
