// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProfileAvatar from '../components/ProfileAvatar';

describe('ProfileAvatar', () => {
  it('renders the registered profile photo', () => {
    const photoUrl = '/api/db/storage-image?p=profile-photos%2Fuser-1&t=123';
    render(
      <ProfileAvatar
        profile={{
          nickname: '민수',
          mbti: 'INTJ',
          personality_score: 50,
          photo_url: photoUrl,
        }}
      />,
    );

    expect(screen.getByRole('img', { name: '민수' }).getAttribute('src')).toBe(photoUrl);
  });
});
