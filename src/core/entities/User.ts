export interface UserProps {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  createdAt: Date;
}

export class User {
  private constructor(private readonly props: UserProps) {}

  static fromProps(props: UserProps): User {
    return new User(props);
  }

  get id() { return this.props.id; }
  get email() { return this.props.email; }
  get fullName() { return this.props.fullName; }
  get avatarUrl() { return this.props.avatarUrl; }
  get createdAt() { return this.props.createdAt; }

  toProps(): UserProps {
    return { ...this.props };
  }
}
