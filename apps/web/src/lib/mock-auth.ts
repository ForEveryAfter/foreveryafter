// TODO: replace with Clerk in Pass 5
export const MOCK_USERS = {
  myron: {
    id: "mock-user-myron-001",
    email: "myronlee@gmail.com",
    firstName: "Myron",
    lastName: "Lee",
    role: "child" as const,
  },
  harold: {
    id: "mock-user-harold-001",
    email: "myron_lee@hotmail.com",
    firstName: "Harold",
    lastName: "Lee",
    role: "parent" as const,
  },
};

export const getMockUser = (searchParams?: URLSearchParams) => {
  const mockUserParam = searchParams?.get('mockUser');
  if (mockUserParam === 'harold') return MOCK_USERS.harold;
  return MOCK_USERS.myron;
};

// Legacy support for Pass 3
export const MOCK_USER = MOCK_USERS.myron;

export const MOCK_AUTH = {
  isSignedIn: true,
  user: MOCK_USER,
  isLoading: false,
};
