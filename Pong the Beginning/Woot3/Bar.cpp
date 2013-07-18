#include "Bar.h"

using namespace sf;

Bar::Bar(void)
{
	rec = new RectangleShape(Vector2f(50,100));
	rec->setSize(Vector2f(10, 100));
	rec->setPosition(10,0);
	
	speed = 500;
}

Bar::~Bar(void)
{
	delete rec;
}

void Bar::move(float x, float y)
{
	Vector2f a = rec->getPosition();
	a.x += x;
	a.y += y;
	rec->setPosition(a);
}

void Bar::move(Vector2f dir)
{
	Vector2f a = rec->getPosition();
	a.x += dir.x;
	a.y += dir.y;
	rec->setPosition(a);
}