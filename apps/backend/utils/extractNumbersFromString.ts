export function extractNumbersFromString(input: string): string {
    // 数字以外の文字を除去する正規表現
    const regex = /\D/g;

    // 数字のみを取り出す
    const numbers = input.replace(regex, '');

    // 文字数合わせの0を削除する
    const trimmedNumbers = numbers.replace(/^0+/, '');

    return trimmedNumbers;
}