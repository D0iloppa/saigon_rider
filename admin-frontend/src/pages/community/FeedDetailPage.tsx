import { useNavigate, useParams } from 'react-router-dom'
import { Alert, Avatar, Button, Card, Descriptions, Image, List, Popconfirm, Skeleton, Space, Tag, message } from 'antd'
import dayjs from 'dayjs'
import { useDeleteFeedPost, useFeedComments, useFeedPost } from '../../api/feed'

export default function FeedDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: post, isLoading, isError, error } = useFeedPost(id)
  const { data: comments, isLoading: commentsLoading } = useFeedComments(id)
  const deletePost = useDeleteFeedPost()

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="피드 정보를 불러오지 못했습니다."
        description={error instanceof Error ? error.message : undefined}
      />
    )
  }
  if (isLoading || !post) {
    return (
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
    )
  }

  const lat = post.latitude !== null ? Number(post.latitude) : null
  const lng = post.longitude !== null ? Number(post.longitude) : null

  return (
    <Card
      title={
        <Space>
          작성자
          <a onClick={() => navigate(`/users/${post.author.id}`)}>
            <Space size={6}>
              <Avatar src={post.author.avatar_url} size={24} />
              {post.author.nickname ?? '-'}
            </Space>
          </a>
          {post.is_story && <Tag color="gold">STORY</Tag>}
        </Space>
      }
      extra={
        <Space>
          <Button onClick={() => navigate(`/community/feed/${id}/edit`)}>수정</Button>
          <Popconfirm
            title="이 피드를 삭제하시겠습니까?"
            okText="삭제"
            cancelText="취소"
            onConfirm={() =>
              deletePost.mutate(id, {
                onSuccess: () => {
                  message.success('피드가 삭제되었습니다.')
                  navigate('/community/feed')
                },
                onError: (err) => message.error(err instanceof Error ? err.message : '삭제에 실패했습니다.'),
              })
            }
          >
            <Button danger loading={deletePost.isPending}>
              삭제
            </Button>
          </Popconfirm>
        </Space>
      }
    >
      {post.image_urls.length > 0 && (
        <Image.PreviewGroup>
          <Space style={{ marginBottom: 16 }} wrap>
            {post.image_urls.map((url) => (
              <Image key={url} src={url} width={160} height={160} style={{ objectFit: 'cover' }} />
            ))}
          </Space>
        </Image.PreviewGroup>
      )}
      <Descriptions column={2} bordered size="small">
        <Descriptions.Item label="내용" span={2}>
          <span style={{ whiteSpace: 'pre-line' }}>{post.content ?? '-'}</span>
        </Descriptions.Item>
        <Descriptions.Item label="좋아요">{post.like_count}</Descriptions.Item>
        <Descriptions.Item label="댓글">{post.comment_count}</Descriptions.Item>
        <Descriptions.Item label="지역">{post.district_name ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="좌표">{lat !== null && lng !== null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : '-'}</Descriptions.Item>
        <Descriptions.Item label="등록일">{dayjs(post.created_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
        <Descriptions.Item label="수정일">{dayjs(post.updated_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
      </Descriptions>

      <Card type="inner" title={`댓글 (${comments?.length ?? 0})`} style={{ marginTop: 16 }} loading={commentsLoading}>
        <List
          dataSource={comments ?? []}
          locale={{ emptyText: '댓글이 없습니다.' }}
          renderItem={(comment) => (
            <List.Item style={{ paddingLeft: comment.parent_id ? 32 : 0 }}>
              <List.Item.Meta
                avatar={<Avatar src={comment.author.avatar_url} size={24} />}
                title={
                  <Space>
                    {comment.author.nickname ?? '-'}
                    <span style={{ fontWeight: 'normal', color: 'rgba(0,0,0,0.45)' }}>
                      {dayjs(comment.created_at).format('YYYY-MM-DD HH:mm')}
                    </span>
                    <span style={{ fontWeight: 'normal', color: 'rgba(0,0,0,0.45)' }}>좋아요 {comment.like_count}</span>
                  </Space>
                }
                description={
                  <Space direction="vertical" size={4}>
                    {comment.content && <span style={{ whiteSpace: 'pre-line' }}>{comment.content}</span>}
                    {comment.image_url && <Image src={comment.image_url} width={80} height={80} style={{ objectFit: 'cover' }} />}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Card>
    </Card>
  )
}
