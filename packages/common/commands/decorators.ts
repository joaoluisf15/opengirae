export enum CommandArgumentType {
  CARD = 'CARD',
  CATEGORY = 'CATEGORY',
  SUBCATEGORY = 'SUBCATEGORY',
  DISCOTECA_GENRE = 'DISCOTECA_GENRE',
  DISCOTECA_SUBCATEGORY = 'DISCOTECA_SUBCATEGORY',
  DISCOTECA_ENTRY = 'DISCOTECA_ENTRY',
  DISCOTECA_ARTIST = 'DISCOTECA_ARTIST',
  VANITY_ITEM = 'VANITY_ITEM',
  USER_MENTION = 'USER_MENTION',
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  HEX_COLOR = 'HEX_COLOR',
  BOOLEAN = 'BOOLEAN',
  EMOJI = 'EMOJI',
}

interface BaseCommandArgumentSpec<T = any> {
  name: string;
  description?: string;
  nullable?: boolean;
  guard?: (value: T, ctx: any) => boolean | string | Promise<boolean | string>;
}

export type CommandArgumentSpec<T = any> =
  // showBasePrice: true for admin commands (editbg/delbg/etc.), which must see the raw catalog price
  | (BaseCommandArgumentSpec<T> & { type: CommandArgumentType.VANITY_ITEM; vanityType: 'background' | 'sticker'; showBasePrice?: boolean })
  | (BaseCommandArgumentSpec<T> & { type: CommandArgumentType.DISCOTECA_ENTRY; entryType?: 'album' | 'single' })
  | (BaseCommandArgumentSpec<T> & { type: CommandArgumentType.DISCOTECA_SUBCATEGORY; subcategoryType?: 'album' | 'single' })
  // paginatedAmbiguous: true replaces the flat "N results" text dump with a real paginated list on a multi-match search - opt-in per command, /card is the only user today.
  | (BaseCommandArgumentSpec<T> & { type: CommandArgumentType.CARD; paginatedAmbiguous?: boolean })
  | (BaseCommandArgumentSpec<T> & { type: Exclude<CommandArgumentType, CommandArgumentType.VANITY_ITEM | CommandArgumentType.DISCOTECA_ENTRY | CommandArgumentType.DISCOTECA_SUBCATEGORY | CommandArgumentType.CARD> });

export function CommandArgument(specs: CommandArgumentSpec[]) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    if (!target.commandArguments) {
      target.commandArguments = {};
    }
    target.commandArguments[propertyKey] = specs;
  };
}

export interface SubcommandOptions {
  name: string;
  description: string;
  isWorkflow?: boolean;
  aliases?: string[];
}

export function Subcommand(options: SubcommandOptions) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    if (!target.subcommands) {
      target.subcommands = {};
    }
    const entry = {
      ...options,
      methodName: propertyKey
    };
    target.subcommands[options.name] = entry;
    for (const alias of options.aliases ?? []) {
      target.subcommands[alias] = entry;
    }
  };
}

export interface QuickViewOptions {
  name: string;
}

export function QuickView(options: QuickViewOptions) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    if (!target.quickViews) {
      target.quickViews = {};
    }
    target.quickViews[options.name] = { methodName: propertyKey };
  };
}

export interface PageOptions {
  name: string;
  // if true, only the user who triggered the original reply can page through it
  restricted?: boolean;
}

// registers a static `(arg: string, page: number, authorId: string) => Promise<{content, photoUrl?, isVideo?, hasNext} | null>`
// method as a stateless pagination handler
export function Page(options: PageOptions) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    if (!target.pages) {
      target.pages = {};
    }
    target.pages[options.name] = { methodName: propertyKey, restricted: !!options.restricted };
  };
}
