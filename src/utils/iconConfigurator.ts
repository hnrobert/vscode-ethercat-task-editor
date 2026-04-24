import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 配置 EtherCAT 文件图标
 * 尝试将图标嵌入到用户当前使用的主题中
 */
export async function configureFileIcon(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const currentTheme = config.get<string>('workbench.iconTheme');

  if (!currentTheme) {
    vscode.window.showInformationMessage(
      'You are not using any icon theme. Please install and enable an icon theme first.',
    );
    return;
  }

  const iconSourcePath = path.join(context.extensionPath, 'assets', 'images', 'icon-nobg.png');

  // 检测并配置不同的主题
  if (currentTheme === 'material-icon-theme' || currentTheme.includes('material')) {
    await configureMaterialIconTheme(context, iconSourcePath);
  } else if (currentTheme === 'vscode-icons' || currentTheme.includes('vscode-icons')) {
    await configureVSCodeIcons(context, iconSourcePath);
  } else {
    // 对于其他主题，提供通用方案
    await configureGenericTheme(context, iconSourcePath, currentTheme);
  }
}

/**
 * 配置 Material Icon Theme
 * 将图标文件添加到主题目录并修改配置
 */
async function configureMaterialIconTheme(_context: vscode.ExtensionContext, iconSourcePath: string): Promise<void> {
  try {
    // 查找 Material Icon Theme 的安装目录
    const extensionsPath = path.join(
      process.env.HOME || process.env.USERPROFILE || '',
      '.vscode',
      'extensions'
    );

    let themeDir: string | null = null;
    if (fs.existsSync(extensionsPath)) {
      const dirs = fs.readdirSync(extensionsPath);
      const materialThemeDir = dirs.find(dir => dir.startsWith('pkief.material-icon-theme'));
      if (materialThemeDir) {
        themeDir = path.join(extensionsPath, materialThemeDir);
      }
    }

    if (!themeDir || !fs.existsSync(themeDir)) {
      vscode.window.showWarningMessage(
        'Could not find Material Icon Theme installation directory. Using fallback configuration.',
      );
      await configureFallback();
      return;
    }

    // 复制图标到主题的 icons 目录
    const iconsDir = path.join(themeDir, 'icons');
    if (!fs.existsSync(iconsDir)) {
      vscode.window.showWarningMessage(
        'Material Icon Theme icons directory not found. Using fallback configuration.',
      );
      await configureFallback();
      return;
    }

    const iconDestPath = path.join(iconsDir, 'ethercat.svg');

    // 将 PNG 转换为 SVG 引用（或直接复制 PNG）
    // 为了简单起见，我们复制 PNG 并重命名为 SVG（Material Icon Theme 也支持 PNG）
    const pngDestPath = path.join(iconsDir, 'ethercat.png');
    fs.copyFileSync(iconSourcePath, pngDestPath);

    // 修改主题的 icon 定义文件
    const iconDefinitionsPath = path.join(themeDir, 'dist', 'material-icons.json');
    if (fs.existsSync(iconDefinitionsPath)) {
      const iconDefinitions = JSON.parse(fs.readFileSync(iconDefinitionsPath, 'utf8'));

      // 添加 EtherCAT 图标定义
      if (!iconDefinitions.iconDefinitions) {
        iconDefinitions.iconDefinitions = {};
      }

      iconDefinitions.iconDefinitions._ethercat = {
        iconPath: '../icons/ethercat.png'
      };

      // 添加语言关联
      if (!iconDefinitions.languageIds) {
        iconDefinitions.languageIds = {};
      }

      iconDefinitions.languageIds['ethercat-yaml'] = '_ethercat';

      // 写回文件
      fs.writeFileSync(iconDefinitionsPath, JSON.stringify(iconDefinitions, null, 2));

      vscode.window.showInformationMessage(
        'EtherCAT icon has been added to Material Icon Theme!',
      );
    } else {
      await configureFallback();
    }
  } catch (error) {
    console.error('Error configuring Material Icon Theme:', error);
    vscode.window.showErrorMessage(
      `Failed to configure Material Icon Theme: ${error}. Using fallback configuration.`,
    );
    await configureFallback();
  }
}

/**
 * 配置 VSCode Icons
 */
async function configureVSCodeIcons(_context: vscode.ExtensionContext, iconSourcePath: string): Promise<void> {
  try {
    // 查找 VSCode Icons 的安装目录
    const extensionsPath = path.join(
      process.env.HOME || process.env.USERPROFILE || '',
      '.vscode',
      'extensions'
    );

    let themeDir: string | null = null;
    if (fs.existsSync(extensionsPath)) {
      const dirs = fs.readdirSync(extensionsPath);
      const vscodeIconsDir = dirs.find(dir => dir.startsWith('vscode-icons-team.vscode-icons'));
      if (vscodeIconsDir) {
        themeDir = path.join(extensionsPath, vscodeIconsDir);
      }
    }

    if (!themeDir || !fs.existsSync(themeDir)) {
      vscode.window.showWarningMessage(
        'Could not find VSCode Icons installation directory. Using fallback configuration.',
      );
      await configureFallback();
      return;
    }

    // VSCode Icons 的图标目录结构
    const iconsDir = path.join(themeDir, 'icons');
    if (!fs.existsSync(iconsDir)) {
      vscode.window.showWarningMessage(
        'VSCode Icons icons directory not found. Using fallback configuration.',
      );
      await configureFallback();
      return;
    }

    // 复制图标文件（使用 file_type_ 前缀）
    const iconFileName = 'file_type_ethercat.png';
    const pngDestPath = path.join(iconsDir, iconFileName);
    fs.copyFileSync(iconSourcePath, pngDestPath);

    // 查找并修改主题配置文件
    // VSCode Icons 可能有多个配置文件位置
    const possibleConfigPaths = [
      path.join(themeDir, 'dist', 'src', 'vsicons-icon-theme.json'),
      path.join(themeDir, 'out', 'src', 'vsicons-icon-theme.json'),
      path.join(themeDir, 'vsicons-icon-theme.json'),
    ];

    let configPath: string | null = null;
    for (const p of possibleConfigPaths) {
      if (fs.existsSync(p)) {
        configPath = p;
        break;
      }
    }

    if (!configPath) {
      vscode.window.showWarningMessage(
        'VSCode Icons configuration file not found. Using fallback configuration.',
      );
      await configureFallback();
      return;
    }

    // 读取配置文件
    const iconDefinitions = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // 添加 EtherCAT 图标定义
    if (!iconDefinitions.iconDefinitions) {
      iconDefinitions.iconDefinitions = {};
    }

    // 计算相对路径
    const configDir = path.dirname(configPath);
    const relativePath = path.relative(configDir, pngDestPath).replace(/\\/g, '/');

    iconDefinitions.iconDefinitions._file_type_ethercat = {
      iconPath: `./${relativePath}`
    };

    // 添加语言关联
    if (!iconDefinitions.languageIds) {
      iconDefinitions.languageIds = {};
    }

    iconDefinitions.languageIds['ethercat-yaml'] = '_file_type_ethercat';

    // 写回文件
    fs.writeFileSync(configPath, JSON.stringify(iconDefinitions, null, 2));

    vscode.window.showInformationMessage(
      'EtherCAT icon has been added to VSCode Icons!',
    );
  } catch (error) {
    console.error('Error configuring VSCode Icons:', error);
    vscode.window.showErrorMessage(
      `Failed to configure VSCode Icons: ${error}. Using fallback configuration.`,
    );
    await configureFallback();
  }
}

/**
 * 配置通用主题
 */
async function configureGenericTheme(_context: vscode.ExtensionContext, _iconSourcePath: string, themeName: string): Promise<void> {
  vscode.window.showInformationMessage(
    `Your current theme "${themeName}" is not directly supported. Using fallback configuration.`,
  );
  await configureFallback();
}

/**
 * 回退配置：使用语言关联到相似的图标
 */
async function configureFallback(): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const currentTheme = config.get<string>('workbench.iconTheme');

  if (currentTheme === 'material-icon-theme' || currentTheme?.includes('material')) {
    // Material Icon Theme: 关联到 YAML 图标
    const associations = config.get<Record<string, string>>(
      'material-icon-theme.languages.associations',
    ) || {};

    associations['ethercat-yaml'] = 'yaml';

    await config.update(
      'material-icon-theme.languages.associations',
      associations,
      vscode.ConfigurationTarget.Global,
    );

    vscode.window.showInformationMessage(
      'EtherCAT files will use the YAML icon. For a custom icon, please see the documentation.',
    );
  } else if (currentTheme === 'vscode-icons' || currentTheme?.includes('vscode-icons')) {
    // VSCode Icons: 关联到 YAML 图标
    const associations = config.get<Record<string, string>>(
      'vsicons.associations.files',
    ) || {};

    // VSCode Icons 使用文件扩展名关联
    associations['.ethercat.yaml'] = 'yaml';
    associations['.ethercat.yml'] = 'yaml';

    await config.update(
      'vsicons.associations.files',
      associations,
      vscode.ConfigurationTarget.Global,
    );

    vscode.window.showInformationMessage(
      'EtherCAT files will use the YAML icon. For a custom icon, please see the documentation.',
    );
  } else {
    vscode.window.showInformationMessage(
      'Please configure the icon manually. See the documentation for details.',
    );
  }
}
