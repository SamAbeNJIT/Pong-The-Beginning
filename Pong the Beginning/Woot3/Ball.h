#pragma once
#include <SFML/Graphics.hpp>
#include <string>
#include <time.h>
#include <iostream>
#include "Bar.h"
#include "Ball.h"
#pragma once

using namespace std;
using namespace sf;

class Ball
{
public:
	Ball(void);
	~Ball(void);

	float speed;
	CircleShape* shape;

	void move(float x, float y);
	void move(Vector2f dir);
	void update(float deltaTime);
	void setPosition(Vector2f pos);

	Vector2f getPosition();
	Vector2f Ball::normalize(const Vector2f& source);

	Vector2f velocity;
	
};