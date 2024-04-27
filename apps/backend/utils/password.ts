import bcrypt from 'bcrypt';
const saltRounds = 10;

export const hashPassword = async (password: string) => {
    const salt = await bcrypt.genSalt(saltRounds);
    const hash = await bcrypt.hash(password, salt);
    return hash;
}

export const verifyPassword = async (password: string, hash: string) => {
    const isValid = await bcrypt.compare(password, hash);
    return isValid;
}