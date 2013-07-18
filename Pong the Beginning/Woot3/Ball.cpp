#include "Ball.h"
#include <SFML/Graphics.hpp>
#include <string>
#include <time.h>
#include <iostream>
#include "Bar.h"
#pragma once

using namespace std;
using namespace sf;



Ball::Ball(void)
{
	speed = 700;
	shape = new CircleShape(10); 
	shape->setPosition(100,100);

	velocity.x = 0;
	velocity.y = 0;

}
void Ball::move(float x, float y)
{	
	shape = new CircleShape(10); 
	Vector2f a = shape->getPosition();
	a.x += x;
	a.y += y;
	shape->setPosition(a);
}

void Ball::move(Vector2f dir)
{
	Vector2f a = shape->getPosition();
	a.x += dir.x;
	a.y += dir.y;
	shape->setPosition(a);
}

Vector2f Ball::getPosition()
{
	return shape->getPosition();
}

void Ball::update(float dt)
{
	Vector2f a = shape->getPosition();
	Vector2f velNorm = normalize(velocity);
	velNorm *= (speed*dt);

	a += velNorm;

	shape->setPosition(a);
}

void Ball::setPosition(Vector2f pos)
{
	shape->setPosition(pos);
}

Vector2f Ball::normalize(const Vector2f& source)
{
    float length = sqrt((source.x * source.x) + (source.y * source.y));
    if (length != 0)
        return Vector2f(source.x / length, source.y / length);
    else
        return Vector2f(source);
}


Ball::~Ball(void)
{
	
}
