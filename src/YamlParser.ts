import * as yaml from 'yaml';

type YamlParseOptions = yaml.ParseOptions &
  yaml.DocumentOptions &
  yaml.SchemaOptions &
  yaml.ToJSOptions;

const CustomTags: yaml.Tags = [
  {
    tag: '!uint8_t',
    identify: (value: unknown) => typeof value === 'number',
    resolve: (value: string) => Number(value),
  },
  {
    tag: '!int8_t',
    identify: (value: unknown) => typeof value === 'number',
    resolve: (value: string) => Number(value),
  },
  {
    tag: '!uint16_t',
    identify: (value: unknown) => typeof value === 'number',
    resolve: (value: string) => Number(value),
  },
  {
    tag: '!int16_t',
    identify: (value: unknown) => typeof value === 'number',
    resolve: (value: string) => Number(value),
  },
  {
    tag: '!uint32_t',
    identify: (value: unknown) => typeof value === 'number',
    resolve: (value: string) => Number(value),
  },
  {
    tag: '!int32_t',
    identify: (value: unknown) => typeof value === 'number',
    resolve: (value: string) => Number(value),
  },
  {
    tag: '!float',
    identify: (value: unknown) => typeof value === 'number',
    resolve: (value: string) => Number(value),
  },
  {
    tag: '!std::string',
    identify: (value: unknown) => typeof value === 'string',
    resolve: (value: string) => String(value),
  },
];

const yamlParseOptions: YamlParseOptions = { customTags: CustomTags };

export function parseYamlWithTags(text: string): unknown {
  return yaml.parse(text, yamlParseOptions);
}

export function stringifyYamlWithTags(data: unknown): string {
  return yaml.stringify(data, { customTags: CustomTags });
}
