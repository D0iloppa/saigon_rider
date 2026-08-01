from datetime import date, datetime
from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    size: int


class DevContextOut(BaseModel):
    id: int
    key: str
    value: str | None = None
    status: str = "⏸"
    meta: dict | None = None
    updated_at: datetime

    model_config = {"from_attributes": True}


class DevContextUpsertRequest(BaseModel):
    key: str
    value: str | None = None
    status: str | None = None
    meta: dict | None = None


class DevFeatureOut(BaseModel):
    id: int
    category: str
    name: str
    description: str | None = None
    status: str
    sort_order: int
    meta: dict | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DevFeatureCreateRequest(BaseModel):
    category: str
    name: str
    description: str | None = None
    status: str = "PLANNED"
    sort_order: int = 0
    meta: dict | None = None


class DevFeatureUpdateRequest(BaseModel):
    category: str | None = None
    name: str | None = None
    description: str | None = None
    status: str | None = None
    sort_order: int | None = None
    meta: dict | None = None


class DevTodoOut(BaseModel):
    id: int
    title: str
    description: str | None = None
    priority: str
    status: str
    feature_id: int | None = None
    feature: DevFeatureOut | None = None
    due_date: date | None = None
    meta: dict | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DevTodoCreateRequest(BaseModel):
    title: str
    description: str | None = None
    priority: str = "MEDIUM"
    status: str = "TODO"
    feature_id: int | None = None
    due_date: date | None = None
    meta: dict | None = None


class DevTodoUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    status: str | None = None
    feature_id: int | None = None
    due_date: date | None = None
    meta: dict | None = None
